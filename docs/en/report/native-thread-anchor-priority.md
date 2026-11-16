# Native thread anchor priority

[简体中文](../../zh-CN/report/原生Codex线程锚点优先级说明.md) · [Gateway](../../../backend/service/src/gateway/README.md)

## Rule

`native anchor > explicit prompt_cache_key > sticky fallback`

Native conversation/turn-state metadata carries the client's resume semantics. An unrelated body cache key must not replace that identity or clear a valid turn state. Without a native anchor, preserve an explicitly supplied prompt cache key; only then use a compatibility fallback.

| Input | Required behavior |
| --- | --- |
| Native anchor only | Preserve native identity |
| Explicit cache key only | Preserve client cache key |
| Both, conflicting | Native identity wins |
| Both, matching | Retain native semantics |
| Adapter-generated temporary key | Do not treat it as the original client identity |

Headers include `conversation_id`, `session_id` and `x-codex-turn-state`, interpreted by the relevant adapter. A generated Anthropic compatibility key is distinct from an original native anchor.

## Implementation and regression

Review [local validation](../../../backend/service/src/gateway/local_validation/request.rs), [session affinity](../../../backend/service/src/gateway/request/session_affinity.rs), [conversation binding](../../../backend/service/src/gateway/routing/conversation_binding.rs) and [WebSocket handling](../../../backend/service/src/http/responses_websocket.rs).

Cover JSON/SSE and supported WebSocket paths, conflicts, missing values and source changes. Retained inline Rust tests and actual runtime probes replace historical references to deleted standalone test directories.

## Diagnosis

Compare incoming anchors, explicit body cache keys and the final upstream request. Check proxy preservation of underscore headers before changing routing policy. Logs should record identifiers needed for correlation without copying account tokens, complete prompts or private conversation content.
