# Configuration reference

[简体中文](CONFIGURATION.zh-CN.md) · [Architecture](../ARCHITECTURE.md) · [Environment example](../.env.example)

## Loading and precedence

Rust processes look beside their executable for the first existing file: `boost.env`, `Boost.env`, then `.env`. Existing process variables take precedence; environment-file values fill missing variables. Persisted settings and supported runtime overrides apply below explicit environment values. A repository-root `.env` is not automatically loaded by binaries in `target/debug`.

Copy only the needed entries from [.env.example](../.env.example) into the executable's environment file. Keep credentials out of version control. Desktop-owned storage defaults to `~/.boost`; standalone paths default beside the executable. Relative storage paths are executable-relative. Listener behavior also depends on persisted bind mode and explicit deployment settings.

## Bootstrap and storage

| Variable | Type | Default | Required | Purpose |
| --- | --- | --- | --- | --- |
| `BOOST_DB_PATH` | path | Desktop: `~/.boost/data/boost.db`; standalone: `boost.db` beside executable | No | Main database path |
| `BOOST_DB_ENCRYPTION` | enum: off/keyring | Existing plain configuration unless explicitly enabled; stored security metadata remains authoritative | No | System-credential key setup at startup; never hot-reloaded |
| `BOOST_DB_KEY_FILE` | private file path | Unset | No | Explicit headless key: 32 raw bytes or 64 hexadecimal digits; DO NOT COMMIT; supplied consistently to every database user |
| `BOOST_RPC_TOKEN_FILE` | path | Desktop data directory or executable-relative `boost.rpc-token` | No | Shared internal credential file; DO NOT COMMIT |
| `BOOST_RPC_TOKEN` | secret string | Generated/persisted credential if unset | No | Explicit internal RPC credential; DO NOT COMMIT |
| `BOOST_SERVICE_ADDR` | host:port | `localhost:12580` | No | Service connection/listener override; bind mode also applies |
| `BOOST_STORAGE_MAX_CONNECTIONS` | positive integer | `32` | No | Connection cap per database-path bucket |
| `BOOST_STORAGE_MAX_IDLE_CONNECTIONS` | nonnegative integer | `16` | No | Idle storage connections |
| `BOOST_STORAGE_ACQUIRE_TIMEOUT_MS` | integer, ms | `30000` | No | Pool acquisition deadline |
| `BOOST_BOT_ROOT` | path | Discovered prepared runtime | No | Bot runtime override |
| `BOOST_BOT_NODE` | executable path | Bundled/discovered Node executable | No | Bot Node override |

Bootstrap values must be available before storage opens. A key file takes precedence over system-credential metadata. Existing encrypted databases require their original key; setting encryption off does not decrypt them. Key files must have private Unix permissions; restrict Windows ACLs in the deployment. See [runtime loading](../backend/service/src/runtime/process_env.rs), [encryption](../backend/core/src/storage/encryption.rs), [storage pool](../backend/service/src/storage/storage_helpers.rs), [listeners](../backend/service/src/app_settings/service.rs) and [Bot discovery](../backend/service/src/bot/mod.rs).

## Advanced settings catalog

The table covers all 59 entries in the current [settings catalog](../backend/service/src/app_settings/env_overrides/catalog/items.rs). Defaults below are catalog metadata; empty values mean unset, and zero can select automatic/unbounded behavior depending on the owning component. The `runtime`/ `restart` column describes the catalog apply mode. Dedicated settings controls take precedence over editing reserved keys through the generic editor. Authentication identifiers below are public protocol constants, not credentials.

| Variable | Value type | Catalog default | Required | Scope / apply | Purpose |
| --- | --- | --- | --- | --- | --- |
| `BOOST_ACCOUNT_IMPORT_BATCH_SIZE` | integer | `200` | No | service / runtime | Account import batch size |
| `BOOST_ACCOUNT_MAX_INFLIGHT` | integer | `0` | No | service / runtime | Maximum in-flight requests per account; 0 delegates to automatic policy |
| `BOOST_ALLOW_NON_LOOPBACK_LOGIN_ADDR` | integer | `0` | No | service / runtime | Allow non-loopback OAuth callback |
| `BOOST_CANDIDATE_CACHE_TTL_MS` | integer | `500` | No | service / runtime | Candidate cache TTL in ms |
| `BOOST_CLIENT_ID` | string | `app_EMoamEEZ73f0CkXaXp7hrann` | No | service / runtime | OAuth public client identifier |
| `BOOST_CODEX_IMAGE_GENERATION_AUTO_INJECT_TOOL` | integer | `1` | No | service / runtime | Automatically inject image tool |
| `BOOST_CODEX_IMAGE_GENERATION_ENABLED` | integer | `1` | No | service / runtime | Enable image compatibility path |
| `BOOST_CODEX_IMAGE_MAIN_MODEL` | string | `gpt-5.4-mini` | No | service / runtime | Image primary model |
| `BOOST_CODEX_IMAGE_TOOL_MODEL` | string | `gpt-image-2` | No | service / runtime | Image tool model |
| `BOOST_COMPACT_API_PATH` | string | `/v1/responses/compact` | No | service / runtime | Compact upstream path |
| `BOOST_FRONT_PROXY_MAX_BODY_BYTES` | integer | `0` | No | service / runtime | Front-proxy body size limit in bytes |
| `BOOST_GATEWAY_BLOCKED_PATHS` | string | `/v1/props` | No | service / runtime | Locally blocked gateway paths |
| `BOOST_GATEWAY_KEEPALIVE_FAILURE_BACKOFF_MAX_SECS` | integer | `900` | No | service / runtime | Keepalive backoff cap in seconds |
| `BOOST_GATEWAY_KEEPALIVE_JITTER_SECS` | integer | `5` | No | service / runtime | Keepalive jitter in seconds |
| `BOOST_GITHUB_TOKEN` | string | — | No | desktop / restart | GitHub access token; DO NOT COMMIT |
| `BOOST_HTTP_BRIDGE_OUTPUT_TEXT_LIMIT_BYTES` | integer | `0` | No | service / runtime | Bridge output text cap in bytes |
| `BOOST_HTTP_QUEUE_FACTOR` | integer | `4` | No | service / restart | HTTP queue multiplier |
| `BOOST_HTTP_QUEUE_MIN` | integer | `32` | No | service / restart | Minimum HTTP queue size |
| `BOOST_HTTP_STREAM_QUEUE_FACTOR` | integer | `2` | No | service / restart | Streaming queue multiplier |
| `BOOST_HTTP_STREAM_QUEUE_MIN` | integer | `16` | No | service / restart | Minimum streaming queue size |
| `BOOST_ISSUER` | string | `https://auth.openai.com` | No | service / runtime | OAuth issuer |
| `BOOST_LOGIN_ADDR` | string | `localhost:1455` | No | service / runtime | OAuth callback listener |
| `BOOST_NO_SERVICE` | string | — | No | desktop / restart | Disable managed desktop service startup |
| `BOOST_ORIGINATOR` | string | `codex_cli_rs` | No | service / runtime | OAuth originator |
| `BOOST_POLL_FAILURE_BACKOFF_MAX_SECS` | integer | `1800` | No | service / runtime | Polling backoff cap in seconds |
| `BOOST_POLL_JITTER_SECS` | integer | `5` | No | service / runtime | Polling jitter in seconds |
| `BOOST_PROMPT_CACHE_CAPACITY` | integer | `0` | No | service / runtime | Prompt cache capacity |
| `BOOST_PROMPT_CACHE_CLEANUP_INTERVAL_SECS` | integer | `60` | No | service / runtime | Prompt cache cleanup interval in seconds |
| `BOOST_PROMPT_CACHE_TTL_SECS` | integer | `0` | No | service / runtime | Prompt cache TTL in seconds |
| `BOOST_PROXY_LIST` | string | — | No | service / runtime | Upstream proxy list |
| `BOOST_REDIRECT_URI` | string | `http://localhost:1455/auth/callback` | No | service / runtime | OAuth redirect URI |
| `BOOST_REQUEST_GATE_WAIT_TIMEOUT_MS` | integer | `5000` | No | service / runtime | Request gate wait deadline in ms |
| `BOOST_ROUTE_HEALTH_P2C_BALANCED_WINDOW` | integer | `1` | No | service / runtime | Balanced routing P2C window |
| `BOOST_ROUTE_HEALTH_P2C_ENABLED` | integer | `1` | No | service / runtime | Enable P2C health selection |
| `BOOST_ROUTE_HEALTH_P2C_ORDERED_WINDOW` | integer | `3` | No | service / runtime | Ordered routing P2C window |
| `BOOST_ROUTE_STATE_CAPACITY` | integer | `0` | No | service / runtime | Route state capacity |
| `BOOST_ROUTE_STATE_TTL_SECS` | integer | `0` | No | service / runtime | Route state TTL in seconds |
| `BOOST_STRICT_REQUEST_PARAM_ALLOWLIST` | integer | `0` | No | service / runtime | Strict request parameter allowlist |
| `BOOST_SSE_KEEPALIVE_INTERVAL_MS` | integer | `15000` | No | service / runtime | SSE keepalive interval in ms |
| `BOOST_TRACE_BODY_PREVIEW_MAX_BYTES` | integer | `0` | No | service / runtime | Trace body preview limit in bytes |
| `BOOST_TRACE_QUEUE_CAPACITY` | integer | `4096` | No | service / runtime | Trace queue capacity, clamped to 1–65536; zero no longer creates an unbounded queue |
| `BOOST_TOKEN_REFRESH_AHEAD_SECS` | integer | `3600` | No | service / runtime | Token refresh lead time in seconds |
| `BOOST_UPDATE_PRERELEASE` | string | — | No | desktop / restart | Include prerelease updates |
| `BOOST_UPSTREAM_BASE_URL` | string | `https://chatgpt.com/backend-api/codex` | No | service / runtime | Model upstream base URL |
| `BOOST_UPSTREAM_CONNECT_TIMEOUT_SECS` | integer | `15` | No | service / runtime | Upstream connect timeout in seconds |
| `BOOST_UPSTREAM_STREAM_TIMEOUT_MS` | integer | `300000` | No | service / runtime | Stream inactivity timeout in ms |
| `BOOST_UPSTREAM_TOTAL_TIMEOUT_MS` | integer | `0` | No | service / runtime | Total upstream deadline in ms; 0 disables |
| `BOOST_OBSERVABILITY_MAINTENANCE_INTERVAL_SECS` | integer | `900` | No | service / runtime | Observability maintenance interval in seconds |
| `BOOST_REQUEST_LOG_RETENTION_DAYS` | integer | `14` | No | service / runtime | Request detail retention in days |
| `BOOST_REQUEST_TOKEN_STATS_RETENTION_DAYS` | integer | `14` | No | service / runtime | Token detail retention in days |
| `BOOST_USAGE_BASE_URL` | string | `https://chatgpt.com` | No | service / runtime | Usage upstream base URL |
| `BOOST_USAGE_POLL_FAILURE_BACKOFF_MAX_SECS` | integer | `1800` | No | service / runtime | Usage polling backoff cap in seconds |
| `BOOST_USAGE_POLL_JITTER_SECS` | integer | `5` | No | service / runtime | Usage polling jitter in seconds |
| `BOOST_USAGE_REFRESH_FAILURE_EVENT_WINDOW_SECS` | integer | `60` | No | service / runtime | Usage failure event dedup window in seconds |
| `BOOST_USAGE_SNAPSHOTS_RETAIN_PER_ACCOUNT` | integer | `1` | No | service / runtime | Usage snapshots kept per account |
| `BOOST_WEB_ADDR` | string | `localhost:12000` | No | web / restart | Web listener |
| `BOOST_WEB_NO_OPEN` | string | — | No | web / restart | Disable automatic browser launch |
| `BOOST_WEB_NO_SPAWN_SERVICE` | string | — | No | web / restart | Disable service spawn by Web |
| `BOOST_WEB_ROOT` | string | — | No | web / restart | Static UI directory override |

## Bot HTTP ingress

These variables belong to the optional Python process; Rust environment-file loading does not configure Uvicorn. Set them in the process environment or Compose service.

| Variable | Type | Default | Required | Purpose |
| --- | --- | --- | --- | --- |
| `BOT_API_UPSTREAM` | HTTP(S) origin | `http://127.0.0.1:12000` | No | Fixed trusted Boost Web origin |
| `BOT_API_CONCURRENCY` | integer, 1–4096 | `256` | No | Active requests per worker, including SSE |
| `BOT_API_QUEUE_SIZE` | integer, 0–16384 | `512` | No | Waiting requests per worker |
| `BOT_API_QUEUE_TIMEOUT` | positive seconds | `15` | No | Admission deadline |
| `BOT_API_MAX_BODY_BYTES` | positive bytes | `33554432` | No | Maximum request body |
| `BOT_API_BODY_BUDGET_BYTES` | bytes, at least max body | `67108864` | No | Buffered body budget per worker |

Sources: [FastAPI settings](../bot/backend/api/app.py), [deployment](../bot/backend/api/README.md). Remaining component-specific switches are described in the [runtime manual](en/report/environment-and-runtime-config.md), [release configuration](en/report/app-updates-and-releases.md) and [Bot integration](../bot/INTEGRATION.md); build-only variables are not application settings.
