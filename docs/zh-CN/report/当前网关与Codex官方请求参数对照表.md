# 网关协议兼容边界

[English](../../en/report/gateway-vs-codex-official-params.md)

## 兼容矩阵

| 范围 | 网关责任 | 限制 |
| --- | --- | --- |
| Responses | 请求规范化及支持的响应/流适配 | 上游模型/提供商必须支持 |
| Chat Completions | 按配置转换消息和工具调用 | Responses 能力不一定都有等价表达 |
| Anthropic/Gemini 原生 | 专属路径、认证和负载 | 能力仍由提供商决定 |
| SSE | 保留事件、终止状态和用量 | 中途失败不能透明重试完整请求 |
| 工具 | 保留名称、参数、调用 ID 和结果关联 | 已执行副作用不能安全重放 |
| 会话身份 | 原生锚点及配置亲和 | 切换来源可能改变上游会话 |
| 用量 | 提取观测 Token 并按本地价格估算 | 不替代供应商账单 |

兼容不等于与所有官方客户端/服务版本行为完全相同。未知字段和适配器覆盖规则按实际代码与回归审查。

## 变更约定

覆盖两个 OpenAI 风格端点、JSON/SSE 和 tools/tool_calls，验证缺失/额外字段、终止事件、取消、错误体、流用量与来源映射。透传路径避免不必要 JSON 改写，按需保持原始字节。

依据：[协议适配](../../../backend/service/src/gateway/protocol_adapter/)、[请求校验](../../../backend/service/src/gateway/local_validation/)、[上游执行](../../../backend/service/src/gateway/upstream/)和 [HTTP bridge](../../../backend/service/src/gateway/observability/http_bridge/)。

传输边界见[请求头与参数策略](当前网关与Codex请求头和参数差异表.md)。README 不维护未经验证的未来模型参数清单。
