# Inference gateway

[简体中文](README.zh-CN.md) · [System architecture](../../../../ARCHITECTURE.md) · [Resource configuration](../../../../docs/CONFIGURATION.md)

## Request flow

```mermaid
flowchart LR
  Input["HTTP / supported WebSocket"] --> Validate["Key / model / budget"]
  Validate --> Admit["Rate / in-flight / body budget"]
  Admit --> Route["Mapping / availability / circuit"]
  Route --> Adapt["Protocol adapter"]
  Adapt --> Provider["Configured upstream"]
  Provider --> Bridge["JSON / SSE / tool results"]
  Bridge --> Settle["Logs / usage / wallet"]
```

Management JSON-RPC has a separate scheduler. Gateway changes must preserve ownership, model access, wallet and protocol semantics for desktop and Web callers.

## Module ownership

| Module | Responsibility |
| --- | --- |
| `auth/` | Upstream authentication and token exchange |
| `core/` | Runtime configuration and gateway state |
| `local_validation/` | Platform-key checks, normalization and request admission |
| `model_picker/` | Model parsing and catalog decisions |
| `request/` | Entry handling, request rewriting, local model/count responses |
| `routing/` | Candidate selection, conversation bindings, quality, cooldown and circuits |
| `protocol_adapter/` | Unified request shape and downstream adapter selection |
| `upstream/` | Provider executors, transport, attempts and response finalization |
| `observability/` | HTTP bridge, traces, metrics, logs and token extraction |
| `request_limits.rs` | Process admission, rate buckets, model slots and input-memory reservation |

Large entrypoints are legacy surfaces; new substantial logic belongs in focused modules.

## Routing and state

Platform model mappings determine eligible account/aggregate sources and upstream model IDs. Aggregate model discovery must not populate unrelated account mappings. Ordered, balanced and quota-priority policies operate within configured permissions and source availability.

Conversation identity respects native anchors, explicit prompt cache keys and only then sticky fallbacks. Failover must respect thread affinity and whether output or side effects were committed. Source-specific proxy bindings must not silently fall back to direct traffic on failure.

## Resource and fault policy

| Limit | Default |
| --- | --- |
| Global request rate / burst | 20 QPS / 20 |
| Per-key RPM | Disabled until explicitly configured |
| Global / per-model in-flight | 24 / 8; storage headroom can lower global capacity |
| Request body / buffered input | 32 MiB / 64 MiB |
| Front-proxy forwards | 64, held through response completion |
| Circuit | 60 s window, ≥20 samples, >50% failures, 30 s open, one half-open logical probe |

Overload is rejected rather than queued without bounds. Temporary rate/capacity rejection includes Retry-After. Cumulative token limits use conservative text reservations; quota-limited requests must specify a positive output-token bound. Hidden provider context and media require additional estimation and are not a proven strict total-token cap. Process-local reservations do not coordinate multiple service instances.

Circuits isolate account and aggregate IDs. Network/5xx failures are eligible; local rejections, ordinary client errors and cancellations are excluded. Upstream 429 retains its cooldown semantics. Existing retry machinery is not permission to replay arbitrary tool effects or delivered SSE.

## Accounting

Server-generated trace identity includes a random process nonce. Settlement combines that identity with the key, so client-provided IDs cannot suppress billing. Request-log/token rows commit together; duplicate finalization reuses the record. Wallet request charges are checked under an immediate transaction and deducted once.

Historical rows are preserved. Exact provider billing, crash-consistent reservations and cross-process budgets remain distinct requirements; see [technical boundaries](../../../../ARCHITECTURE.md).

## Changes and verification

Keep JSON, SSE, Responses and Chat Completions, tools/tool_calls, supported native adapters, cancellation and error mapping covered. Test wrong/missing keys, source isolation, proxy failures, half-open recovery, duplicate settlement and capacity release.

```sh
cargo test --workspace --locked
```

Use isolated mock fixtures for fault injection and real authorized providers for production compatibility claims. [Validation](../../../../TESTING.md) defines build and runtime gates.
