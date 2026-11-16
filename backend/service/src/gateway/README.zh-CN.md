# 推理网关

[English](README.md) · [系统架构](../../../../ARCHITECTURE.zh-CN.md) · [资源配置](../../../../docs/CONFIGURATION.zh-CN.md)

## 请求数据流

```mermaid
flowchart LR
  Input["HTTP / 受支持 WebSocket"] --> Validate["密钥 / 模型 / 预算"]
  Validate --> Admit["速率 / 在途 / 请求体预算"]
  Admit --> Route["映射 / 可用性 / 熔断"]
  Route --> Adapt["协议适配"]
  Adapt --> Provider["配置的上游"]
  Provider --> Bridge["JSON / SSE / 工具结果"]
  Bridge --> Settle["日志 / 用量 / 钱包"]
```

管理 JSON-RPC 使用独立调度。桌面/Web 共享网关授权、模型访问、钱包和协议边界。

## 模块职责

| 模块 | 职责 |
| --- | --- |
| `auth/` | 上游认证与 token exchange |
| `core/` | 网关配置与状态 |
| `local_validation/` | 平台 key、规范化与请求准入 |
| `model_picker/` | 模型解析和目录决策 |
| `request/` | 入口、改写、本地模型/计数响应 |
| `routing/` | 候选、会话绑定、质量、冷却与熔断 |
| `protocol_adapter/` | 统一请求结构与响应适配选择 |
| `upstream/` | 提供商执行器、传输、尝试与最终处理 |
| `observability/` | HTTP bridge、trace、指标、日志和用量提取 |
| `request_limits.rs` | 进程准入、速率桶、模型许可和输入内存 |

大型入口作为遗留面处理，新逻辑放入聚焦模块。

## 路由与状态

平台模型映射决定可用账号/聚合来源及上游模型 ID，聚合发现不得写入无关账号映射。有序、均衡及额度优先策略始终服从权限与来源可用性。

会话优先级为原生锚点、显式缓存 key、最后才是 sticky 兜底。切换须考虑线程亲和、已输出内容和副作用。绑定代理失败不能静默改走直连。

## 资源与故障策略

| 限制 | 默认值 |
| --- | --- |
| 全局速率 / 突发 | 20 QPS / 20 |
| 每 key RPM | 显式配置前关闭 |
| 全局 / 每模型在途 | 24 / 8，连接池余量可能进一步降低全局上限 |
| 单请求体 / 输入缓冲 | 32 MiB / 64 MiB |
| 前置代理转发 | 64，持有到响应结束 |
| 熔断 | 60 秒窗口、至少 20 样本、错误率严格大于 50%、打开 30 秒、一个半开逻辑探测 |

过载明确拒绝，不无限排队；临时拒绝返回 Retry-After。累计 Token 限额采用保守文本预留，受限 key 的请求须指定正的输出 Token 上限。隐藏上下文和媒体仍需额外估计，不能宣称严格的总 Token 上界；进程内预留不协调多服务实例。

熔断按账号/聚合 ID 隔离。网络/5xx 可计故障，本地拒绝、普通客户端错误和取消不计入。上游 429 保留独立冷却；现有重试机制不授权重放工具副作用或已输出 SSE。

## 结算

服务 trace 带随机进程 nonce，和 key 组成结算身份；客户端 ID 不能抑制计费。请求日志与 Token 统计同事务提交，重复 finalize 复用记录；钱包按请求日志 ID 在立即事务内检查并只扣一次。

历史行保留。供应商精确账单、崩溃一致预留和跨进程预算单独跟踪，见 [T10](../../../../update.md)。

## 验证

覆盖 JSON/SSE、Responses/Chat Completions、tools/tool_calls、受支持原生协议、取消与错误映射；验证错/缺密钥、来源隔离、代理故障、半开恢复、重复结算和容量释放。

```sh
cargo test --workspace --locked
```

故障注入使用隔离 mock，真实兼容性结论需有效上游。[验证说明](../../../../TESTING.zh-CN.md)定义构建与运行门槛。
