"""nginx -> FastAPI -> Boost Web authentication -> actor-scoped Bot engine.

The gateway owns no conversation state, credentials, billing or database. It
streams original bytes, never retries a mutation, and bounds both active requests
and queue length. Multiple workers are safe because execution stays in Boost.
"""
from __future__ import annotations

import asyncio
import os
from contextlib import asynccontextmanager
from dataclasses import dataclass
from urllib.parse import urlsplit, unquote

import httpx
from fastapi import FastAPI, Request
from starlette.responses import JSONResponse, Response, StreamingResponse


@dataclass(frozen=True)
class Settings:
    upstream: str = "http://127.0.0.1:12000"
    concurrency: int = 256
    queue_size: int = 512
    queue_timeout: float = 15.0
    max_body_bytes: int = 32 * 1024 * 1024
    body_budget_bytes: int = 64 * 1024 * 1024

    def __post_init__(self):
        parsed = urlsplit(self.upstream)
        if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password or parsed.path not in ("", "/") or parsed.query or parsed.fragment:
            raise ValueError("Bot API upstream must be a trusted Boost Web origin")
        if not 1 <= self.concurrency <= 4096 or not 0 <= self.queue_size <= 16384 or self.queue_timeout <= 0 or self.max_body_bytes < 1 or self.body_budget_bytes < self.max_body_bytes:
            raise ValueError("Invalid Bot API capacity")

    @classmethod
    def from_env(cls):
        return cls(
            upstream=os.environ.get("BOT_API_UPSTREAM", cls.upstream),
            concurrency=int(os.environ.get("BOT_API_CONCURRENCY", cls.concurrency)),
            queue_size=int(os.environ.get("BOT_API_QUEUE_SIZE", cls.queue_size)),
            queue_timeout=float(os.environ.get("BOT_API_QUEUE_TIMEOUT", cls.queue_timeout)),
            max_body_bytes=int(os.environ.get("BOT_API_MAX_BODY_BYTES", cls.max_body_bytes)),
            body_budget_bytes=int(os.environ.get("BOT_API_BODY_BUDGET_BYTES", cls.body_budget_bytes)),
        )


class Capacity:
    def __init__(self, settings: Settings):
        self.sem = asyncio.Semaphore(settings.concurrency)
        self.limit = settings.concurrency + settings.queue_size
        self.total = 0
        self.timeout = settings.queue_timeout
        self.body_budget = settings.body_budget_bytes
        self.buffered = 0

    async def acquire(self):
        # No await between check and reservation: one atomic event-loop operation.
        if self.total >= self.limit:
            return False
        self.total += 1
        try:
            await asyncio.wait_for(self.sem.acquire(), self.timeout)
        except BaseException:
            self.total -= 1
            raise
        return True

    def reserve_body(self, size: int):
        if self.buffered + size > self.body_budget:
            return False
        self.buffered += size
        return True

    def release(self, body_size: int = 0):
        self.total -= 1
        self.buffered -= body_size
        self.sem.release()


HOP_HEADERS = {b"connection", b"keep-alive", b"proxy-authenticate", b"proxy-authorization", b"te", b"trailer", b"transfer-encoding", b"upgrade"}
PRIVATE_HEADERS = {b"x-boost-rpc-token", b"x-boost-rpc-actor-role", b"x-boost-rpc-actor-user-id"}


def clean_headers(headers, *, request: bool = False):
    nominated = set()
    for name, value in headers:
        if name.lower() == b"connection":
            nominated.update(item.strip().lower() for item in value.split(b","))
    blocked = HOP_HEADERS | nominated | (PRIVATE_HEADERS | {b'host'} if request else set())
    return [(name, value) for name, value in headers if name.lower() not in blocked]


def create_app(settings: Settings | None = None, transport: httpx.AsyncBaseTransport | None = None):
    settings = settings or Settings.from_env()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.capacity = Capacity(settings)
        app.state.client = httpx.AsyncClient(
            transport=transport, follow_redirects=False, trust_env=False,
            limits=httpx.Limits(max_connections=settings.concurrency, max_keepalive_connections=min(settings.concurrency, 128)),
            timeout=httpx.Timeout(connect=10, pool=settings.queue_timeout, read=3700, write=600),
        )
        try:
            yield
        finally:
            await app.state.client.aclose()

    app = FastAPI(title="Boost Bot API", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)

    @app.get("/healthz", include_in_schema=False)
    async def health():
        return {"status": "ready"}

    @app.api_route("/boost-bot", methods=["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
    @app.api_route("/boost-bot/{path:path}", methods=["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
    async def proxy(request: Request, path: str = ""):
        capacity: Capacity = app.state.capacity
        decoded = unquote(request.url.path)
        if '\\' in decoded or any(part in ('.', '..') for part in decoded.split('/')):
            return JSONResponse({'error': 'Invalid Bot API path'}, status_code=400)
        try:
            admitted = await capacity.acquire()
        except asyncio.TimeoutError:
            admitted = False
        if not admitted:
            return JSONResponse({"error": "Bot API is busy; retry after a short delay"}, status_code=503, headers={"Retry-After": "1"})
        upstream = None
        body_size = 0
        try:
            length = request.headers.get("content-length")
            if length and int(length) > settings.max_body_bytes:
                capacity.release()
                return JSONResponse({"error": "Request body is too large"}, status_code=413)
            # Bound the body before sending so an oversized chunked request cannot
            # partially execute an upstream mutation. Text/JSON/attachments are exact.
            body = bytearray()
            async for chunk in request.stream():
                if body_size + len(chunk) > settings.max_body_bytes:
                    capacity.release(body_size)
                    return JSONResponse({"error": "Request body is too large"}, status_code=413)
                if not capacity.reserve_body(len(chunk)):
                    capacity.release(body_size)
                    return JSONResponse({"error": "Bot API request body capacity is busy"}, status_code=503, headers={"Retry-After": "1"})
                body_size += len(chunk)
                body.extend(chunk)
            raw_path = request.scope.get("raw_path", request.url.path.encode()).decode("ascii")
            query = request.scope.get("query_string", b"")
            url = settings.upstream.rstrip("/") + raw_path + ("?" + query.decode("ascii") if query else "")
            headers = clean_headers(request.headers.raw, request=True)
            outbound = app.state.client.build_request(request.method, url, headers=headers, content=bytes(body))
            upstream = await app.state.client.send(outbound, stream=True)
        except BaseException as exc:
            if upstream is not None:
                await upstream.aclose()
            capacity.release(body_size)
            if isinstance(exc, asyncio.CancelledError):
                raise
            # Never put upstream URLs, user data or credentials into public errors.
            return JSONResponse({"error": "Boost Bot upstream unavailable"}, status_code=502)

        released = False

        async def cleanup():
            nonlocal released
            if released:
                return
            released = True
            try:
                await upstream.aclose()
            finally:
                capacity.release(body_size)

        async def content():
            async for chunk in upstream.aiter_raw():
                yield chunk

        class ForwardedResponse(StreamingResponse):
            async def __call__(self, scope, receive, send):
                try:
                    await super().__call__(scope, receive, send)
                finally:
                    await cleanup()

        response = ForwardedResponse(content(), status_code=upstream.status_code)
        response.raw_headers = clean_headers(upstream.headers.raw)
        response.raw_headers += [(b"x-accel-buffering", b"no")]
        return response

    return app


app = create_app()
