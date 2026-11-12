# Nginx reverse proxy / 反向代理

[Project](../README.md) · [中文首页](../README.zh-CN.md) · [Build guide](../docs/BUILDING.md)

[`nginx.conf`](nginx.conf) is an optional TLS reverse-proxy example for Boost. Normal direct Web access remains **12000**; the example adds HTTPS on 443 in front of it.

`nginx.conf` 是可选的 TLS 代理示例。应用直接访问端口保持 **12000**，示例通过 443 提供 HTTPS。

| Setting | Purpose / 用途 |
| --- | --- |
| `boost_web` → `127.0.0.1:12000` | Web UI, sessions and Bot proxy / 界面、会话和 Bot 代理 |
| `boost_service` → `127.0.0.1:12580` | Internal API gateway / 内部 API 网关 |
| `underscores_in_headers on` | Preserve session-anchor headers / 保留会话锚点请求头 |
| Disabled buffering on model paths | Preserve streaming and large responses / 保留流式与大响应 |
| WebSocket forwarding | Upgrade support for workspace connections / 工作台连接升级 |

Replace the example domains and certificate paths before use. Match upstream listeners to the deployment network; `127.0.0.1` refers to the proxy host/container itself. Validate with `nginx -t` in the target environment before reloading.

使用前替换示例域名与证书路径，按网络拓扑调整 upstream。容器中的 `127.0.0.1` 指该容器自身。在目标环境执行 `nginx -t` 验证后再重载。

See the [header/cache troubleshooting guide](../docs/en/report/nginx-reverse-proxy-cache-hit-issue.md).
