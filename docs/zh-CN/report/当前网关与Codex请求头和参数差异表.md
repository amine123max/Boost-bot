# 请求头与参数策略

[English](../../en/report/gateway-vs-codex-headers-and-params.md)

## 处理阶段

| 阶段 | 职责 |
| --- | --- |
| 入站快照 | 收集允许的头，不授予身份 |
| 会话亲和 | 原生锚点、显式缓存 key 和兜底 |
| 本地校验 | key/模型/归属/预算及规范化 |
| 协议改写 | 已审查的端点/提供商转换 |
| 上游头 | 生成来源认证和允许的元数据 |
| 响应 bridge | 保留 JSON/SSE/工具并提取 usage |

依据：[入站头](../../../backend/service/src/gateway/request/incoming_headers.rs)、[会话](../../../backend/service/src/gateway/request/session_affinity.rs)、[改写](../../../backend/service/src/gateway/request/request_rewrite.rs)、[Codex 头](../../../backend/service/src/gateway/upstream/headers/codex_headers.rs)。

## 敏感与语义字段

提供商 Authorization 来自选定来源，不信任内部 Web actor 声明。客户端身份/会话按既有策略保留；切换来源/线程时有意剥离不兼容状态，并作为路由决定记录。

平台模型授权与上游型号区分，推理等级/服务档位按支持映射。未知字段不能一概复制或删除，分别审查原生透传与适配；图片/multipart 不能当文本 JSON 重编码。

## 回归矩阵

覆盖原生锚点冲突/缺失、缓存 key、认证替换、模型映射、档位、推理选项、工具名称/ID/参数、JSON/SSE 和受支持 WebSocket；验证终止及 usage，而不只比较请求快照。

历史字段表不证明与官方客户端完全一致。提供商字段演进，以[兼容边界](当前网关与Codex官方请求参数对照表.md)和当前代码为准。
