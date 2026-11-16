# Gateway protocol compatibility boundaries

[简体中文](../../zh-CN/report/当前网关与Codex官方请求参数对照表.md)

## Compatibility matrix

| Area | Gateway responsibility | Limit |
| --- | --- | --- |
| Responses | Request normalization and supported response/stream adaptation | Upstream model/provider must support the operation |
| Chat Completions | Message and tool-call conversion where configured | Not every Responses feature has an equivalent |
| Native Anthropic/Gemini | Provider-specific paths, auth and payload handling | Native capabilities remain provider-dependent |
| SSE | Preserve event framing, terminal state and reported usage | Mid-stream failure cannot become a transparent full retry |
| Tools | Preserve names, arguments, call IDs and result association | Already-executed effects are not safe to replay |
| Session identity | Preserve native anchors and configured affinity | Switching sources can change upstream conversation state |
| Usage | Extract observed tokens and estimate local price | Not a substitute for provider invoices |

Compatibility does not mean exact behavioral identity with every official client or server version. Unknown upstream fields and adapter-specific overrides must be reviewed against actual source and regression cases.

## Change contract

Cover both supported OpenAI-style endpoints, JSON/SSE and tools/tool_calls. Verify missing/extra fields, terminal events, cancellation, error bodies, stream usage and model-source mapping. For a passthrough route, avoid unnecessary JSON rewrites and preserve body bytes where required.

Implementation sources: [protocol adapters](../../../backend/service/src/gateway/protocol_adapter/), [request validation](../../../backend/service/src/gateway/local_validation/), [upstream executors](../../../backend/service/src/gateway/upstream/) and [HTTP bridge](../../../backend/service/src/gateway/observability/http_bridge/).

See [header/parameter policy](gateway-vs-codex-headers-and-params.md) for transport boundaries. Do not maintain an unverified list of future model parameters in README.
