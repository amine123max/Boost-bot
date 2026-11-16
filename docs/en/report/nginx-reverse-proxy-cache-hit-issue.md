# Proxy headers and cache diagnosis

[简体中文](../../zh-CN/report/Nginx反向代理导致缓存命中偏低说明.md)

## Boundary

A proxy can drop underscore session headers or buffer SSE, changing apparent behavior even when the upstream model is unchanged. A lower cache-hit observation alone does not prove provider cache failure.

| Signal | What to compare |
| --- | --- |
| conversation_id / session_id | Inbound and service-observed anchors |
| x-codex-turn-state and related metadata | Preservation or intentional stripping on source/thread changes |
| prompt_cache_key | Explicit body value vs native anchor precedence |
| First byte / total time | Upstream timing vs proxy buffering/idle deadline |
| cached input tokens | Same model, context, source, window and observed usage |

The repository [Nginx example](../../../nginx/nginx.conf) enables underscore headers and preserves explicit session metadata. Review the narrow set of required headers rather than assuming every arbitrary header is trusted.

## Validation

Use the same authorized account, model and payload with direct and proxied routes. Compare redacted traces, source selection and timing. Check SSE delivery incrementally and verify supported WebSocket upgrade. A cache ratio is provider-controlled; it is not guaranteed by preserving a header.

Nginx read timeout is inactivity between reads; keepalive caches idle connections. Neither replaces application admission. Do not enable automatic upstream replay to hide intermittent failures.

## Privacy

Do not log account tokens, full conversation text or secret query URLs. Keep internal actor/RPC values server-side. See [anchor priority](native-thread-anchor-priority.md), [Nginx deployment](../../../nginx/README.md) and [validation](../../../TESTING.md).
