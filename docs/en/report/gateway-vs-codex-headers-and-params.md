# Header and parameter policy

[简体中文](../../zh-CN/report/当前网关与Codex请求头和参数差异表.md)

## Processing stages

| Stage | Responsibility |
| --- | --- |
| Incoming snapshot | Capture accepted headers without granting identity |
| Session affinity | Resolve native anchors, explicit cache key and fallback |
| Local validation | Key/model/ownership/budget and normalized request |
| Protocol rewrite | Apply reviewed endpoint/provider conversion |
| Upstream headers | Generate provider authorization and allowed metadata |
| Response bridge | Preserve JSON/SSE/tools and extract observed usage |

Sources: [incoming headers](../../../backend/service/src/gateway/request/incoming_headers.rs), [session policy](../../../backend/service/src/gateway/request/session_affinity.rs), [rewrites](../../../backend/service/src/gateway/request/request_rewrite.rs), [Codex headers](../../../backend/service/src/gateway/upstream/headers/codex_headers.rs).

## Sensitive and semantic fields

Provider Authorization comes from the selected source, never an internal Web actor claim. Preserve client identity/session fields only through the defined policy. When source/thread affinity changes, stripping incompatible state is deliberate and must be logged as a routing decision.

Model IDs distinguish platform authorization from upstream execution. Reasoning level and service tier use supported mappings. Unknown fields are not universally safe to copy or delete; review native passthrough and adapter behavior separately. Image/multipart bodies must not be blindly parsed/reencoded as text JSON.

## Regression matrix

Cover native anchor conflict/missing cases, explicit cache keys, provider-auth replacement, model mapping, service tier, reasoning options, tool names/IDs/arguments, JSON/SSE and supported WebSocket paths. Verify terminal events and usage rather than only matching a request snapshot.

Do not claim exact official-client equivalence based on a historical field table. Public provider fields evolve; [compatibility boundaries](gateway-vs-codex-official-params.md) and current source remain authoritative.
