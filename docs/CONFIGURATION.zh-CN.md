# 配置参考

[English](CONFIGURATION.md) · [系统架构](../ARCHITECTURE.md) · [环境示例](../.env.example)

## 加载与优先级

Rust 进程在可执行文件目录依次查找 `boost.env`、`Boost.env`、`.env`，仅加载第一个存在的文件。已有进程环境变量优先，环境文件只补未定义值；持久化设置与受支持运行时覆盖低于显式环境变量。仓库根目录的 `.env` 不会自动被 `target/debug` 中的程序加载。

从 [.env.example](../.env.example) 选择所需条目放入实际可执行文件旁，凭据不得提交。桌面数据默认位于 `~/.boost`，独立服务默认使用可执行文件目录；相对存储路径也按该目录解析。监听还受持久化 bind mode 和部署显式配置影响。

## 启动与存储

| 变量 | 类型 | 默认值 | 必填 | 作用 |
| --- | --- | --- | --- | --- |
| `BOOST_DB_PATH` | 路径 | 桌面 `~/.boost/data/boost.db`；独立服务为程序旁 `boost.db` | 否 | 主库路径 |
| `BOOST_DB_ENCRYPTION` | off/keyring 枚举 | 既有明文配置保留，显式启用；已保存安全元数据继续生效 | 否 | 启动时设置系统凭据密钥，不支持热更新 |
| `BOOST_DB_KEY_FILE` | 私有文件路径 | 未设 | 否 | 无界面密钥：32 原始字节或 64 位十六进制；勿提交，各数据库进程配置一致 |
| `BOOST_RPC_TOKEN_FILE` | 路径 | 桌面数据目录或程序旁 `boost.rpc-token` | 否 | 共享内部凭据文件，勿提交 |
| `BOOST_RPC_TOKEN` | 秘密字符串 | 未设时生成/读取持久凭据 | 否 | 内部 RPC 凭据，勿提交 |
| `BOOST_SERVICE_ADDR` | host:port | `localhost:12580` | 否 | 服务连接/监听覆盖，同时受 bind mode 影响 |
| `BOOST_STORAGE_MAX_CONNECTIONS` | 正整数 | `32` | 否 | 每数据库路径分桶的连接上限 |
| `BOOST_STORAGE_MAX_IDLE_CONNECTIONS` | 非负整数 | `16` | 否 | 空闲连接上限 |
| `BOOST_STORAGE_ACQUIRE_TIMEOUT_MS` | 毫秒 | `30000` | 否 | 获取连接期限 |
| `BOOST_FRONT_PROXY_MAX_INFLIGHT` | 整数，1–4096 | `64` | 否 | 入口代理同时处理的 HTTP 请求数，包含未结束的流；重启生效。 |
| `BOOST_BOT_ROOT` | 路径 | 自动发现已准备运行时 | 否 | Bot 运行目录 |
| `BOOST_BOT_NODE` | 可执行文件路径 | 内置/自动发现 Node | 否 | Bot Node 路径 |

启动参数须在打开存储前提供。显式密钥文件优先于系统凭据元数据；既有加密库必须使用原密钥，设置 off 不会解密。Unix 密钥文件权限必须私有，Windows 部署需限制 ACL。依据：[加载](../backend/service/src/runtime/process_env.rs)、[加密](../backend/core/src/storage/encryption.rs)、[连接池](../backend/service/src/storage/storage_helpers.rs)、[监听](../backend/service/src/app_settings/service.rs)、[Bot 发现](../backend/service/src/bot/mod.rs)。

## 单模型并发

网关设置中的全局并发和每模型并发均支持 1–2,048，保留既有设置与桌面默认值。在专用服务上启用单模型 1,000 并发时，将**每模型并发**设为 1,000，**全局并发**设为至少 1,000。网关会为管理操作预留四分之一的数据库连接；未结束的流会占用一个工作线程和一个数据库连接。

隔离 SSE 验证使用 `BOOST_STORAGE_MAX_CONNECTIONS=1400`、`BOOST_FRONT_PROXY_MAX_INFLIGHT=1200`，并将 `BOOST_HTTP_STREAM_WORKER_MIN` 和 `BOOST_HTTP_STREAM_WORKER_MAX` 都设为 `1024`。若需承载 1,000 条同时运行的 JSON 请求，则需要调整普通工作线程设置（`BOOST_HTTP_WORKER_MIN` / `BOOST_HTTP_WORKER_MAX`）。这些服务环境变量在重启后生效。根据流量和上游额度配置线程、连接数，以及全局 QPS、突发上限和每密钥 RPM。此配置可能消耗较多内存和套接字。

编译 release 程序后，运行 `node scripts/probe-resource-limits.mjs --model-concurrency` 检查 1,000 条同模型流是否能保持并发；加上 `--json` 可测试非流式请求。单独运行 `node scripts/probe-resource-limits.mjs --throughput --tuned --protocols --qps=2200 --assert-target`，验证成功请求吞吐量和 P95 完成耗时。探针使用本机模拟上游，无法衡量真实模型的生成耗时。

## 高级设置目录

下表覆盖当前[设置目录](../backend/service/src/app_settings/env_overrides/catalog/items.rs)全部 59 项。默认值来自目录元数据；空白表示未设，零值的自动/无限语义按所属组件解释；运行时/重启列对应目录声明。保留项通过专用设置控件管理，不经通用编辑器覆盖。OAuth 标识为公开协议常量，不是凭据。

| 变量 | 值类型 | 目录默认值 | 必填 | 范围 / 生效 | 作用 |
| --- | --- | --- | --- | --- | --- |
| `BOOST_ACCOUNT_IMPORT_BATCH_SIZE` | 整数 | `200` | 否 | service / 运行时 | 账号导入批大小 |
| `BOOST_ACCOUNT_MAX_INFLIGHT` | 整数 | `0` | 否 | service / 运行时 | 单账号最大并发 |
| `BOOST_ALLOW_NON_LOOPBACK_LOGIN_ADDR` | 整数 | `0` | 否 | service / 运行时 | 允许非回环登录回调 |
| `BOOST_CANDIDATE_CACHE_TTL_MS` | 整数 | `500` | 否 | service / 运行时 | 候选缓存 TTL（毫秒） |
| `BOOST_CLIENT_ID` | 字符串 | `app_EMoamEEZ73f0CkXaXp7hrann` | 否 | service / 运行时 | OpenAI Client ID |
| `BOOST_CODEX_IMAGE_GENERATION_AUTO_INJECT_TOOL` | 整数 | `1` | 否 | service / 运行时 | Codex 图片 Tool 自动注入 |
| `BOOST_CODEX_IMAGE_GENERATION_ENABLED` | 整数 | `1` | 否 | service / 运行时 | Codex 图片生成兼容开关 |
| `BOOST_CODEX_IMAGE_MAIN_MODEL` | 字符串 | `gpt-5.4-mini` | 否 | service / 运行时 | Codex 图片主模型 |
| `BOOST_CODEX_IMAGE_TOOL_MODEL` | 字符串 | `gpt-image-2` | 否 | service / 运行时 | Codex 图片工具模型 |
| `BOOST_COMPACT_API_PATH` | 字符串 | `/v1/responses/compact` | 否 | service / 运行时 | Compact 上游路径 |
| `BOOST_FRONT_PROXY_MAX_BODY_BYTES` | 整数 | `0` | 否 | service / 运行时 | 前置代理最大请求体（字节） |
| `BOOST_GATEWAY_BLOCKED_PATHS` | 字符串 | `/v1/props` | 否 | service / 运行时 | 网关本地屏蔽路径 |
| `BOOST_GATEWAY_KEEPALIVE_FAILURE_BACKOFF_MAX_SECS` | 整数 | `900` | 否 | service / 运行时 | 保活失败退避上限（秒） |
| `BOOST_GATEWAY_KEEPALIVE_JITTER_SECS` | 整数 | `5` | 否 | service / 运行时 | 保活抖动（秒） |
| `BOOST_GITHUB_TOKEN` | 字符串 | — | 否 | desktop / 重启 | GitHub 访问令牌；勿提交 |
| `BOOST_HTTP_BRIDGE_OUTPUT_TEXT_LIMIT_BYTES` | 整数 | `0` | 否 | service / 运行时 | HTTP 桥输出截断上限（字节） |
| `BOOST_HTTP_QUEUE_FACTOR` | 整数 | `4` | 否 | service / 重启 | 普通请求队列因子 |
| `BOOST_HTTP_QUEUE_MIN` | 整数 | `32` | 否 | service / 重启 | 普通请求最小队列 |
| `BOOST_HTTP_STREAM_QUEUE_FACTOR` | 整数 | `2` | 否 | service / 重启 | 流式请求队列因子 |
| `BOOST_HTTP_STREAM_QUEUE_MIN` | 整数 | `16` | 否 | service / 重启 | 流式请求最小队列 |
| `BOOST_ISSUER` | 字符串 | `https://auth.openai.com` | 否 | service / 运行时 | OpenAI Issuer |
| `BOOST_LOGIN_ADDR` | 字符串 | `localhost:1455` | 否 | service / 运行时 | 登录回调监听地址 |
| `BOOST_NO_SERVICE` | 字符串 | — | 否 | desktop / 重启 | 桌面端不启动 Service |
| `BOOST_ORIGINATOR` | 字符串 | `codex_cli_rs` | 否 | service / 运行时 | 登录 Originator |
| `BOOST_POLL_FAILURE_BACKOFF_MAX_SECS` | 整数 | `1800` | 否 | service / 运行时 | 通用轮询失败退避上限（秒） |
| `BOOST_POLL_JITTER_SECS` | 整数 | `5` | 否 | service / 运行时 | 通用轮询抖动（秒） |
| `BOOST_PROMPT_CACHE_CAPACITY` | 整数 | `0` | 否 | service / 运行时 | Prompt 缓存容量 |
| `BOOST_PROMPT_CACHE_CLEANUP_INTERVAL_SECS` | 整数 | `60` | 否 | service / 运行时 | Prompt 缓存清理间隔（秒） |
| `BOOST_PROMPT_CACHE_TTL_SECS` | 整数 | `0` | 否 | service / 运行时 | Prompt 缓存 TTL（秒） |
| `BOOST_PROXY_LIST` | 字符串 | — | 否 | service / 运行时 | 上游代理池列表 |
| `BOOST_REDIRECT_URI` | 字符串 | `http://localhost:1455/auth/callback` | 否 | service / 运行时 | 登录回调 URI |
| `BOOST_REQUEST_GATE_WAIT_TIMEOUT_MS` | 整数 | `5000` | 否 | service / 运行时 | 请求闸门等待超时（毫秒） |
| `BOOST_ROUTE_HEALTH_P2C_BALANCED_WINDOW` | 整数 | `1` | 否 | service / 运行时 | 均衡模式 P2C 窗口 |
| `BOOST_ROUTE_HEALTH_P2C_ENABLED` | 整数 | `1` | 否 | service / 运行时 | 启用路由 P2C 健康选择 |
| `BOOST_ROUTE_HEALTH_P2C_ORDERED_WINDOW` | 整数 | `3` | 否 | service / 运行时 | 有序模式 P2C 窗口 |
| `BOOST_ROUTE_STATE_CAPACITY` | 整数 | `0` | 否 | service / 运行时 | 路由状态容量 |
| `BOOST_ROUTE_STATE_TTL_SECS` | 整数 | `0` | 否 | service / 运行时 | 路由状态 TTL（秒） |
| `BOOST_STRICT_REQUEST_PARAM_ALLOWLIST` | 整数 | `0` | 否 | service / 运行时 | 严格请求参数白名单 |
| `BOOST_SSE_KEEPALIVE_INTERVAL_MS` | 整数 | `15000` | 否 | service / 运行时 | SSE 保活间隔（毫秒） |
| `BOOST_TRACE_BODY_PREVIEW_MAX_BYTES` | 整数 | `0` | 否 | service / 运行时 | Trace Body 预览上限（字节） |
| `BOOST_TRACE_QUEUE_CAPACITY` | 整数 | `4096` | 否 | service / 运行时 | Trace 队列容量，限制为 1–65536；零不再表示无限 |
| `BOOST_TOKEN_REFRESH_AHEAD_SECS` | 整数 | `3600` | 否 | service / 运行时 | Token 刷新提前量（秒） |
| `BOOST_UPDATE_PRERELEASE` | 字符串 | — | 否 | desktop / 重启 | 更新包含预发布 |
| `BOOST_UPSTREAM_BASE_URL` | 字符串 | `https://chatgpt.com/backend-api/codex` | 否 | service / 运行时 | 上游基础地址 |
| `BOOST_UPSTREAM_CONNECT_TIMEOUT_SECS` | 整数 | `15` | 否 | service / 运行时 | 上游连接超时（秒） |
| `BOOST_UPSTREAM_STREAM_TIMEOUT_MS` | 整数 | `300000` | 否 | service / 运行时 | 上游流式空闲超时（毫秒） |
| `BOOST_UPSTREAM_TOTAL_TIMEOUT_MS` | 整数 | `0` | 否 | service / 运行时 | 上游总超时（毫秒，0 为关闭） |
| `BOOST_OBSERVABILITY_MAINTENANCE_INTERVAL_SECS` | 整数 | `900` | 否 | service / 运行时 | 观测数据清理检查间隔（秒） |
| `BOOST_REQUEST_LOG_RETENTION_DAYS` | 整数 | `14` | 否 | service / 运行时 | 请求日志明细保留天数 |
| `BOOST_REQUEST_TOKEN_STATS_RETENTION_DAYS` | 整数 | `14` | 否 | service / 运行时 | 请求 token 明细保留天数 |
| `BOOST_USAGE_BASE_URL` | 字符串 | `https://chatgpt.com` | 否 | service / 运行时 | 用量接口基础地址 |
| `BOOST_USAGE_POLL_FAILURE_BACKOFF_MAX_SECS` | 整数 | `1800` | 否 | service / 运行时 | 用量轮询失败退避上限（秒） |
| `BOOST_USAGE_POLL_JITTER_SECS` | 整数 | `5` | 否 | service / 运行时 | 用量轮询抖动（秒） |
| `BOOST_USAGE_REFRESH_FAILURE_EVENT_WINDOW_SECS` | 整数 | `60` | 否 | service / 运行时 | 用量失败事件去重窗口（秒） |
| `BOOST_USAGE_SNAPSHOTS_RETAIN_PER_ACCOUNT` | 整数 | `1` | 否 | service / 运行时 | 每账号保留用量快照数 |
| `BOOST_WEB_ADDR` | 字符串 | `localhost:12000` | 否 | web / 重启 | Web 监听地址 |
| `BOOST_WEB_NO_OPEN` | 字符串 | — | 否 | web / 重启 | Web 启动后不自动打开 |
| `BOOST_WEB_NO_SPAWN_SERVICE` | 字符串 | — | 否 | web / 重启 | Web 不自动拉起 Service |
| `BOOST_WEB_ROOT` | 字符串 | — | 否 | web / 重启 | Web 静态资源目录 |

## Bot HTTP 接入层

以下配置属于可选 Python 进程，须通过进程环境或 Compose 注入；Rust 环境文件不会为 Uvicorn 加载配置。

| 变量 | 类型 | 默认值 | 必填 | 作用 |
| --- | --- | --- | --- | --- |
| `BOT_API_UPSTREAM` | HTTP(S) origin | `http://127.0.0.1:12000` | 否 | 固定可信 Boost Web 来源 |
| `BOT_API_CONCURRENCY` | 整数 1–4096 | `256` | 否 | 每 worker 活跃请求，包含 SSE 生命周期 |
| `BOT_API_QUEUE_SIZE` | 整数 0–16384 | `512` | 否 | 每 worker 等待请求 |
| `BOT_API_QUEUE_TIMEOUT` | 正数秒 | `15` | 否 | 准入等待期限 |
| `BOT_API_MAX_BODY_BYTES` | 正整数字节 | `33554432` | 否 | 请求体上限 |
| `BOT_API_BODY_BUDGET_BYTES` | 不小于单体上限的字节数 | `67108864` | 否 | 每 worker 请求体缓冲预算 |

依据：[FastAPI 配置](../bot/backend/api/app.py)、[部署](../bot/backend/api/README.md)。其他组件开关见[运行手册](zh-CN/report/环境变量与运行配置说明.md)、[发布配置](zh-CN/release/自动更新与GitHub发布.md)和 [Bot 集成](../bot/INTEGRATION.md)；仅构建时使用的变量不属于应用设置。
