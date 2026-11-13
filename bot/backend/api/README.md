# Boost Bot FastAPI gateway

The service deployment uses `nginx → FastAPI → Boost Web → Rust service → actor-scoped Node Bot engine`. FastAPI is the async HTTP ingress for `/boost-bot/`; it does not replace the stateful agent engine, SQLite ownership checks, model gateway, or channel integrations. Native desktop mode continues to use its managed loopback Rust/Node runtime and does not require Python.

Start the sidecar together with the existing service/Web deployment:

```sh
docker compose -f docker/docker-compose.yml -f docker/docker-compose.bot-api.yml up -d --build
```

For a non-container deployment, install `bot/backend/api/requirements.txt` in a dedicated Python 3.11+ environment and run from the repository root:

```sh
BOT_API_UPSTREAM=http://127.0.0.1:12000 uvicorn bot.backend.api.app:app \
  --host 127.0.0.1 --port 12001 --workers 2 --no-access-log --timeout-keep-alive 65
```

Use the repository's `nginx/nginx.conf`. Its `/boost-bot/` location forwards to port 12001, disables request replay, response buffering and gzip, and permits SSE to remain open. `/api/rpc` and model gateway `/v1/` retain their existing routes. Replace example domains/certificates and run `nginx -t` before reload. The sidecar must target **Boost Web**, never an arbitrary client-provided origin; Boost Web performs session authentication and derives the actor. Caller-supplied internal RPC tokens and actor headers are stripped. Upstream authorization failures are preserved.

| Variable | Default | Meaning |
| --- | --- | --- |
| `BOT_API_UPSTREAM` | `http://127.0.0.1:12000` | Trusted Boost Web origin, without a path or credentials |
| `BOT_API_CONCURRENCY` | `256` | Active requests per worker, including the lifetime of SSE |
| `BOT_API_QUEUE_SIZE` | `512` | Waiting requests per worker |
| `BOT_API_QUEUE_TIMEOUT` | `15` | Maximum admission wait in seconds |
| `BOT_API_MAX_BODY_BYTES` | `33554432` | Body limit per request, matching nginx's 32 MiB limit |
| `BOT_API_BODY_BUDGET_BYTES` | `67108864` | Shared buffered request body budget per worker |

Nginx caps concurrent Bot requests at 512 for the configured virtual host. Counts are per running process/deployment, not an unlimited global capacity guarantee. Each actor's direct model client also limits active model calls to 32 and waiting calls to 256. Queue overflow returns an explicit error; writes are never automatically resubmitted. Increasing these limits cannot increase upstream model quotas.

Requests retain their original body bytes and query string. Responses use raw byte streaming, including SSE framing and compression. The upstream Host is generated from the configured trusted origin rather than accepting a caller-provided Host; private RPC actor/token headers are removed. Disconnecting releases both the upstream connection and admission/body reservations. Request bodies are bounded before forwarding so an oversized upload cannot partially execute a mutation. Access logging is disabled in the example to avoid recording one-time launch tokens in query strings.

The former standalone test fixtures and one-off browser probes have been removed from the source distribution. Validate `/healthz`, authenticated Bot requests, SSE, cancellation and overload responses against the deployed sidecar. Production nginx/TLS and real channel/model credentials require validation in the target deployment.
