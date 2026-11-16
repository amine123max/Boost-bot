# 提供商 challenge 排障

[English](../../en/report/service-provider-challenge-diagnosis.md) · [网络配置](环境变量与运行配置说明.md)

## 分类响应

403 可能来自凭据失效、模型权限、地区政策、代理故障或提供商/WAF challenge。先看状态、内容类型、脱敏错误与 challenge 指标，再调整传输。

| 证据 | 含义 |
| --- | --- |
| JSON 认证错误 | 检查选中账号/key 和刷新状态 |
| 明确地区限制 | 检查提供商支持与部署地区 |
| HTML challenge | 网络/提供商验证页，不是有效模型 JSON |
| 本地代理失败 | 检查来源绑定路由 |
| loopback 被拦截 | 先修复本地访问，不改上游语义 |

不得绕过提供商账号、地区或访问限制。浏览器成功不代表同一账号/API 操作支持服务器访问。

## 可选工具

scripts 中保留 curl_cffi 和 WARP 排障助手，属于可选系统/网络配置，不是默认启动，也不保证解决上游拒绝。执行前阅读脚本并审查主机/网络影响。

使用有权限的本地 HTTP 桥时，只绑定 loopback，保留认证，不记录凭据，显式设置可信上游并验证取消/SSE/请求体限制；不能公开未鉴权的凭据转发代理。

## 验收

用同一受权操作比较直连/代理，记录来源、传输、错误与耗时，确认失败不会静默改走未指定直连。脱敏日志，区分 fixture 和真实上游验收。

依据：[代理策略](../../../backend/service/src/proxy_policy.rs)、[传输](../../../backend/service/src/gateway/upstream/attempt_flow/transport.rs)、[配置](../../CONFIGURATION.zh-CN.md)。
