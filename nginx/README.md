# Nginx reverse proxy / 反向代理

[Project](../README.md) · [中文首页](../README.zh-CN.md) · [Build guide](../docs/BUILDING.md)

## QQ robot callbacks / QQ 机器人回调

QQ uses the official HTTPS Webhook API with Ed25519 verification. Add the account in Bot Settings → Chat channels, then configure its displayed `/boost-bot/amb/hooks/qq/<account-key>` path under your public HTTPS domain in the QQ console. The old QQ WebSocket event service is no longer maintained by the platform.

Include [qq-webhook.conf.example](qq-webhook.conf.example) inside the HTTPS server block. In a separate server-only file with restricted permissions, define `set $boost_qq_rpc_token "<content of BOOST_RPC_TOKEN_FILE>";` and include it before this location. The example targets the existing `boost_service` upstream on port 12580, keeps the service's RPC authentication, forwards the QQ signature headers, and fixes the actor to the desktop administrator. Use the account owner's configured actor for a service deployment; do not accept actor headers from public clients. Never paste the Boost RPC token into the QQ console or a browser. The Bot verifies the signature, timestamp and App ID, limits callback size, acknowledges challenges/heartbeats and deduplicates events. Unconfigured or disabled accounts do not accept messages. This example requires your actual TLS domain and server secret configuration; copying the repository does not deploy it automatically.

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

Management RPCs are queued in Boost service, shared by every user connected to that service process (6 executing, 256 waiting, 60-second queue timeout). The exact `/api/rpc` location permits a 720-second response wait and disables upstream replay. The local desktop package uses its own local service queue. Multiple Boost service processes have separate queues; Nginx keepalive counts are not a shared concurrency limit.

管理 RPC 在 Boost 服务中统一排队，同一服务进程的全部用户共享：6 个执行、256 个等待，排队超时 60 秒。`/api/rpc` 精确匹配使用 720 秒响应等待，并关闭上游重放。本地安装包使用自己的本机服务队列。多个 Boost 服务进程分别维护队列；Nginx 的 keepalive 数量不代表全局并发上限。

See the [header/cache troubleshooting guide](../docs/en/report/nginx-reverse-proxy-cache-hit-issue.md).

Bot traffic now has a dedicated `/boost-bot/` location: `boost_bot_api` at port 12001 runs the [FastAPI gateway](../bot/backend/api/README.md), which forwards to the authenticated Boost Web service. Start `docker/docker-compose.bot-api.yml` as an overlay or run the documented uvicorn command before enabling this location. API and SSE request bodies and response bytes are preserved, buffering/compression and automatic replay are disabled, and long-lived streams retain a 3700-second inactivity timeout. The virtual host admits at most 512 concurrent Bot connections; FastAPI and the model clients also bound their own active/waiting work.

Bot 使用独立的 `/boost-bot/` 路由，经 12001 端口的 [FastAPI 网关](../bot/backend/api/README.md) 进入原有 Boost Web 鉴权链。启用该路由前启动 Compose overlay 或文档中的 uvicorn 服务。普通管理 RPC 和 `/v1/` 模型网关保持原路径。FastAPI 不是无限并发开关：默认每 worker 256 个活跃请求、512 个等待、15 秒排队上限；Nginx 的虚拟主机限制为 512 个 Bot 并发连接。超限明确返回错误，不自动重放消息或其他写操作。
