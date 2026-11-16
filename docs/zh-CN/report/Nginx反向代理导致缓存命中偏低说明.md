# 代理请求头与缓存排障

[English](../../en/report/nginx-reverse-proxy-cache-hit-issue.md)

## 边界

代理丢弃下划线会话头或缓冲 SSE，会在模型不变时改变表观行为；缓存命中下降本身不证明供应商缓存故障。

| 信号 | 比较内容 |
| --- | --- |
| conversation_id / session_id | 入站与服务观察到的锚点 |
| x-codex-turn-state 等 | 是否保留，或因来源/线程切换明确剥离 |
| prompt_cache_key | 显式请求体值与原生锚点优先级 |
| 首字节/总耗时 | 上游时间与代理缓冲/空闲期限 |
| 缓存输入 Token | 相同模型、上下文、来源、窗口和真实 usage |

仓库 [Nginx 示例](../../../nginx/nginx.conf)启用下划线并保留指定元数据；仅信任所需头，不把所有任意头都视为可信。

## 验证

用相同有权限账号、模型和输入对比直连/代理，关联脱敏 trace、来源与耗时；逐段验证 SSE 和受支持 WebSocket。缓存比率由提供商决定，保留请求头不保证命中。

Nginx 读超时为空闲期限，keepalive 缓存空闲连接，都不替代应用准入；不能启用自动重放掩盖间歇故障。

## 隐私

不记录账号 token、完整对话或秘密 query URL，内部 actor/RPC 只在服务端。参见[锚点优先级](原生Codex线程锚点优先级说明.md)、[Nginx](../../../nginx/README.zh-CN.md)和[验证](../../../TESTING.zh-CN.md)。
