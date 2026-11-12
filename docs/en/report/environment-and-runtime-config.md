# Environment and Runtime Configuration

## Multiple upstream proxies

Core discovery is local-first: Boost checks managed binaries, application directories, PATH, running sing-box/v2rayN executable locations and common installation folders, validating version 1.12+ and Clash API/uTLS support. A usable local core is reused without an online version check. Install scans locally again and downloads only when no usable core exists. Kernel management shows the detected path/version and offers a local rescan. Scanning does not read another application's proxy configuration or overwrite its executable. Online checks occur only for explicit update actions or when daily auto-update is enabled.

Proxy management lives in Tests → Network speed (`/tests/network/`), with the original segmented buttons, a top-right import menu and compact node cards. Import full HTTP/HTTPS/SOCKS5/Trojan/AnyTLS URLs or local port forms such as `7897`, `127.0.0.1:7897`, `localhost:7897` and `[::1]:7897` (default HTTP). The local proxy dialog also supports SOCKS5. Local means the **service host**. Local node flags are obtained by querying the actual exit country through that proxy; failed queries remain unknown. Double-click a card or press Enter/Space to pin a node; a single click does not change routing. The home page supports `/home` and `/home/`, with `/` retained as an alias.

A single HTTP/HTTPS/SOCKS5 proxy needs no extra core. Multiple-node selection or Trojan/AnyTLS requires sing-box 1.12+ with Clash API and uTLS. The Kernel menu supports manual installation, update checks, updates and optional daily automatic updates (off by default). Official GitHub assets are SHA-256 verified, version/feature checked and configuration checked before activation. Managed binaries live in `proxy-core/` beside the database; obsolete managed files and downloads are removed without backups. External cores beside the executable or on PATH remain supported and are never overwritten. The system `tar` tool is required. Valid nodes can be saved before installation, while traffic remains blocked. Core bootstrap downloads can access official GitHub when the proxy core is unavailable.

Nodes remain in `gateway.upstream_proxy_url` / `BOOST_UPSTREAM_PROXY_URL`; strategy, stable manual-node ID, per-account bindings, auto-update preference and managed-core path are persisted in `gateway.proxy_control.v1`. The defaults are stable selection, no bindings and auto-update off. Account selectors appear in the account table, account tests and account editor. Pinned accounts use dedicated authenticated entrances for HTTP/SSE/WebSocket, token refresh, usage/subscription checks and warmup; deleting their node blocks traffic until explicitly reassigned. These controls remain administrator-only.

Supported native links use TCP + TLS with `sni`, `fp`, `alpn`, `insecure` / `allowInsecure` and optional `type=tcp`, `headerType=none`, `security=tls`. Certificates are verified unless explicitly disabled. Stable selection uses 200 ms tolerance, latency selection uses 1 ms, and manual selection pins the chosen node. Manual speed tests perform three HTTP connectivity probes, a 1 MB Cloudflare download and an exit-country lookup, at concurrency three; the reported failure percentage is an HTTP connectivity failure rate, not ICMP packet loss. Status refreshes every three seconds. Existing connections survive automatic selection changes, while importing configuration or replacing the core rebuilds entrances and may require retries. Node or core failure never falls back to direct AI requests. See the [Chinese guide](../../zh-CN/report/环境变量与运行配置说明.md#多节点上游代理) for details.

## Boost Bot runtime

The embedded runtime source lives in `bot/`; run `node scripts/prepare-boost-bot.mjs` to prepare it. `BOOST_BOT_ROOT` can select a runtime directory and `BOOST_BOT_NODE` can select the Node executable. Set both `BOOST_BOT_CATALOG_URL` and `BOOST_BOT_CATALOG_PUBKEY` to enable an additional signed catalog. The bundled bots are used by default. Appearance preferences are stored on the device in `boost.bot.appearance.v1`. See [Boost Bot](../../../bot/README.md) for permissions and packaging.

## 目标

本文档用于集中说明 Boost 的环境变量加载规则、设置页持久化规则，以及常用配置项的推荐改法。

源码中的 `BOOST_*` 常量仍是最终准入标准；本文档负责给协作者提供稳定入口，不替代源码校验。

## 配置来源与优先级

当前配置来源主要有四层：

1. 系统环境变量 / 启动命令环境变量
2. 可执行文件同目录环境文件：`boost.env` -> `Boost.env` -> `.env`
3. `app_settings` 持久化表
4. 桌面端设置页的专属设置卡片 / 高级环境变量编辑器

实际生效优先级可概括为：

- 当前进程已存在环境变量（包括启动前系统环境变量，以及启动时从 `env` 文件读入的值）
- 专属设置卡片 / 持久化 `envOverrides`
- 代码默认值

补充规则：

- 环境文件只会注入“当前进程尚未定义”的变量
- 进程启动后，设置页保存的 `envOverrides` 只会补齐“当前进程还没有”的变量
- 桌面端当前已改为 `env` 优先：如果进程里已经有同名 `BOOST_*` 变量，设置页持久化配置不会再覆盖它
- 支持热更新的 service 运行时配置会立即 reload，但同名 `env` 已存在时会优先沿用 `env`
- bootstrap 级变量仍要求在进程启动前准备好

## env 文件放哪

当前进程会按下面顺序在“可执行文件同目录”查找环境文件：

- `boost.env`
- `Boost.env`
- `.env`

也就是说：

- 启动桌面端程序时，`env` 文件要放在桌面端实际可执行文件所在目录
- 启动 `boost-start` / `boost-service` / `boost-web` 时，`env` 文件也要放在对应可执行文件旁边
- 三种文件名只会命中一个，优先推荐统一使用 `boost.env`

## 建议如何修改配置

### 优先走设置页的项目

以下变量已有专属设置卡片，不建议再通过通用环境变量编辑器修改：

- `BOOST_SERVICE_ADDR`
- `BOOST_ROUTE_STRATEGY`
- `BOOST_UPSTREAM_PROXY_URL`
- `BOOST_UPSTREAM_TOTAL_TIMEOUT_MS`
- `BOOST_UPSTREAM_STREAM_TIMEOUT_MS`
- `BOOST_SSE_KEEPALIVE_INTERVAL_MS`
- 后台任务相关轮询 / worker 变量

补充说明：

- 历史兼容开关已从主线路径移除，后续不再作为设置页或排障入口保留。

### 必须走系统环境或 env 文件的项目

以下变量属于 bootstrap 配置，不能依赖启动后再补：

- `BOOST_DB_PATH`
- `BOOST_RPC_TOKEN`
- `BOOST_RPC_TOKEN_FILE`

## 常用变量分组

### 地址与入口

- `BOOST_SERVICE_ADDR`：service 地址，默认 `localhost:12580`
- `BOOST_WEB_ADDR`：web 地址，默认 `localhost:12000`
- `BOOST_WEB_ROOT`：web 静态资源目录
- `BOOST_LOGIN_ADDR`：本地 OAuth 回调监听地址

### 网关与上游

- `BOOST_UPSTREAM_BASE_URL`
- `BOOST_UPSTREAM_PROXY_URL`
- `BOOST_UPSTREAM_TOTAL_TIMEOUT_MS`: gateway request total timeout in milliseconds. Default `0` means the service does not cut requests off by total duration.
- `BOOST_UPSTREAM_STREAM_TIMEOUT_MS`
- `BOOST_USE_WEBSOCKET_UPSTREAM`: makes ChatGPT `/v1/responses` streaming upstream requests try WebSocket first. Default `0`. This is experimental; failures fall back to HTTP streaming and the path uses the configured upstream proxy and connect timeout.
- `BOOST_SSE_KEEPALIVE_INTERVAL_MS`
- `BOOST_PROXY_LIST`
- `BOOST_ROUTE_STRATEGY`

### Codex image generation

- `BOOST_CODEX_IMAGE_GENERATION_ENABLED`: enables the image-generation compatibility path. Default `1`.
- `BOOST_CODEX_IMAGE_GENERATION_AUTO_INJECT_TOOL`: automatically injects the `image_generation` tool into normal `/v1/responses` requests. Default `1` to match the official Codex client behavior; explicit client-provided tools are not duplicated.
- `BOOST_CODEX_IMAGE_MAIN_MODEL`: main conversation model used internally by Images API compatibility endpoints. Default `gpt-5.4-mini`.
- `BOOST_CODEX_IMAGE_TOOL_MODEL`: image tool model. Default `gpt-image-2`.

Notes:

- `/v1/images/generations` and `/v1/images/edits` are converted internally to `/v1/responses + image_generation tool`.
- When Codex CLI sends `tools[].type = "image_generation"` natively, the gateway forwards it and does not affect the existing text request path.

## 迁移中的弃用项

以下旧兼容路径已经移除，不再作为配置项继续维护：

迁移方向：

- 项目策略：不再推荐、不再依赖、不再围绕旧兼容开关设计排障路径
- 后续方向：以会话绑定、自动切线程和 `Codex-First` 语义作为主路径

相关决策与设计文档：


### Web 与访问控制

- `BOOST_WEB_ADDR`
- `BOOST_WEB_ROOT`
- `BOOST_WEB_NO_OPEN`
- `BOOST_WEB_NO_SPAWN_SERVICE`

补充说明：

- Web 访问密码当前由设置页写入 `app_settings` 的 `web.auth.password_hash`，不是公开环境变量。

### 后台任务与并发

- `BOOST_USAGE_POLLING_ENABLED`
- `BOOST_USAGE_POLL_INTERVAL_SECS`
- `BOOST_GATEWAY_KEEPALIVE_ENABLED`
- `BOOST_GATEWAY_KEEPALIVE_INTERVAL_SECS`
- `BOOST_TOKEN_REFRESH_POLLING_ENABLED`
- `BOOST_TOKEN_REFRESH_POLL_INTERVAL_SECS`
- `BOOST_WARMUP_CRON_ENABLED`
- `BOOST_WARMUP_CRON_EXPRESSION`
- `BOOST_USAGE_REFRESH_WORKERS`
- `BOOST_HTTP_WORKER_FACTOR`
- `BOOST_HTTP_WORKER_MIN`
- `BOOST_HTTP_STREAM_WORKER_FACTOR`
- `BOOST_HTTP_STREAM_WORKER_MIN`

### 存储与鉴权

- `BOOST_DB_PATH`
- `BOOST_RPC_TOKEN`
- `BOOST_RPC_TOKEN_FILE`
- `BOOST_NO_SERVICE`

### 更新与发布辅助

- `BOOST_UPDATE_PRERELEASE`
- `BOOST_UPDATE_REPO`
- `BOOST_GITHUB_TOKEN`
- `GITHUB_TOKEN`
- `GH_TOKEN`

## env 文件示例

```dotenv
BOOST_SERVICE_ADDR=localhost:12580
BOOST_WEB_ADDR=localhost:12000
BOOST_UPSTREAM_BASE_URL=https://chatgpt.com/backend-api/codex
BOOST_USAGE_POLL_INTERVAL_SECS=600
BOOST_GATEWAY_KEEPALIVE_INTERVAL_SECS=180
BOOST_UPSTREAM_TOTAL_TIMEOUT_MS=0
BOOST_CODEX_IMAGE_GENERATION_ENABLED=1
BOOST_CODEX_IMAGE_GENERATION_AUTO_INJECT_TOOL=1
BOOST_CODEX_IMAGE_TOOL_MODEL=gpt-image-2
# BOOST_RPC_TOKEN=replace_with_your_static_token
```

## 文件夹示例

### 桌面端

Windows 桌面端最直观的放法如下：

```text
Boost/
├─ Boost.exe
├─ boost.env
└─ 其他运行库文件...
```

对应 `boost.env` 示例：

```dotenv
BOOST_SERVICE_ADDR=localhost:12580
BOOST_UPSTREAM_PROXY_URL=http://127.0.0.1:7890
BOOST_UPSTREAM_TOTAL_TIMEOUT_MS=0
BOOST_UPSTREAM_STREAM_TIMEOUT_MS=600000
BOOST_SSE_KEEPALIVE_INTERVAL_MS=15000
```

补充说明：

- 桌面端会读取程序同目录下的 `boost.env`
- 但桌面端默认数据库位于用户主目录的 `.boost/data/boost.db`，缓存、日志、运行时和更新分别存放在 `.boost/cache/`、`.boost/logs/`、`.boost/runtime/`、`.boost/updates/`；升级自动迁移原应用目录
- 默认数据库位置可参考根说明里的“默认数据目录”： [../README.md](../README.md)

### Service 版

如果你用的是 `boost-start` 一键启动包，更推荐把程序和 `env` 文件放成下面这样：

```text
boost-service-bundle/
├─ boost-start.exe
├─ boost-service.exe
├─ boost-web.exe
├─ boost.env
└─ web/
   └─ ...
```

对应 `boost.env` 示例：

```dotenv
BOOST_SERVICE_ADDR=0.0.0.0:12580
BOOST_WEB_ADDR=0.0.0.0:12000
BOOST_DB_PATH=./data/boost.db
BOOST_RPC_TOKEN_FILE=./data/codexmanager.rpc-token
BOOST_UPSTREAM_PROXY_URL=http://127.0.0.1:7890
```

这时目录通常会长成这样：

```text
boost-service-bundle/
├─ boost-start.exe
├─ boost-service.exe
├─ boost-web.exe
├─ boost.env
├─ data/
│  ├─ codexmanager.db
│  └─ codexmanager.rpc-token
└─ web/
   └─ ...
```

补充说明：

- `BOOST_DB_PATH=./data/boost.db` 这种相对路径，会按“可执行文件所在目录”解析
- `BOOST_RPC_TOKEN_FILE` 也是同样规则
- 如果你不写 `BOOST_DB_PATH`，Service 版默认会把数据库放到程序目录下的 `boost.db`

## 排障建议

### OpenAI 上游代理到底作用在哪

`BOOST_UPSTREAM_PROXY_URL` / 设置页“OpenAI 上游代理”当前主要接管的是：

- 网关向上游平台发起的请求
- ChatGPT upstream WebSocket requests when `BOOST_USE_WEBSOCKET_UPSTREAM=1` is enabled
- 用量查询请求
- `refresh_token` 刷新 access token 的请求

Safety note:

- Login-state refresh paths such as `auth.openai.com` / `oauth/token` must exit from an OpenAI-supported region; do not include restricted locations such as Hong Kong in automatic rotation for this path.
- If the refresh request returns `unsupported_country_region_territory`, Service marks the account as `refresh_token_region_blocked` and pauses subsequent automatic refresh attempts. Fix the proxy route, then manually restore the account.

默认不接管的是：

- 你本机浏览器 / 桌面端访问 `localhost` / `127.0.0.1` 的本地回环请求
- 本地 service 与 web 之间的回环通信
- 登录回调成功后的 OAuth `code -> token` 兑换链路

补充规则：

- When both are configured, `BOOST_UPSTREAM_PROXY_URL` takes precedence over the legacy `BOOST_PROXY_LIST` account-affinity pool.
- `BOOST_PROXY_LIST` assigns stable routes per account; `BOOST_UPSTREAM_PROXY_URL` supports either a single global proxy or a newline-separated automatic selection group.

### 改了 env 文件但没生效

优先检查：

1. 是否重启了对应进程
2. 是否已有同名系统环境变量
3. 是否又被设置页持久化配置覆盖

### 设置页改了但服务行为没变

优先检查：

1. 该配置是否属于“重启后生效”
2. 当前改的是专属设置卡片还是通用环境变量编辑器
3. service 日志里是否出现 reload / apply 失败

### 设置了网关传输参数但长流还是异常

优先检查：

1. Check whether `BOOST_UPSTREAM_STREAM_TIMEOUT_MS` is too short and ends long streaming requests early.
2. Check whether `BOOST_UPSTREAM_TOTAL_TIMEOUT_MS` is set to a short non-zero value and cuts requests off by total duration.
3. Check whether `BOOST_SSE_KEEPALIVE_INTERVAL_MS` is too long and lets an intermediate proxy treat SSE as idle.
4. Check client-side timeout or proxy idle limits. In request logs, `120s/1.8s` means total duration / first-response duration; it does not necessarily mean the service total-timeout setting is `120s`.

### 本地回环请求异常

优先检查：

- 是否把系统代理错误地应用到了 `localhost/127.0.0.1`
- 地址是否被写成非预期大小写或非 loopback 主机名

## 相关文档

- 根说明：[README.md](../README.md)
- 架构说明：[ARCHITECTURE.md](../ARCHITECTURE.md)
- 发布说明：[release-and-artifacts.md](../../BUILDING.md)
