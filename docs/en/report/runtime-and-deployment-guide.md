# Runtime and deployment

[简体中文](../../zh-CN/report/运行与部署指南.md)

## Deployment choices

| Mode | Required processes | Normal entry |
| --- | --- | --- |
| Desktop | Tauri-managed Rust service and Node Bot | Native window / local model gateway |
| Direct Web | Service + Web, managed Bot as needed | 12000 |
| Reverse proxy | Nginx plus the chosen Web/model paths | HTTPS virtual hosts |
| Bot sidecar | Optional FastAPI before Boost Web | Configured /boost-bot/ route |
| Containers | All-in-one or split Compose services | Published Web port |

Use the [build guide](../../BUILDING.md) for exact commands and native dependencies. Vite alone is not a complete Web runtime.

## Operational contracts

Set persistent writable storage, consistent internal RPC credentials and the same encryption key provider for every process opening the main database. Environment files load beside the executable. Headless encryption uses a private mounted key file; desktop can use the system credential store.

Review actual listeners, saved bind mode, IPv6 and host port publishing. Public clients cannot select actor/internal credentials. Retain platform keys and Web session authentication on their respective paths.

## Lifecycle and capacity

The launcher owns only its children, retries repeated crashes with bounded backoff and coordinates shutdown. Container supervisors remain a separate ownership layer. Storage initialization failure does not silently start an empty instance.

Queues, model in-flight slots, input buffers, storage connections and optional sidecar budgets are finite and process-scoped. Measure representative load instead of increasing all worker/connection limits. See [performance evidence](../../PERFORMANCE.md).

## Release and acceptance

Package binaries, static UI and native Bot dependencies from one source/version. Preserve notices and verify signed release metadata. A new schema can prohibit downgrade; no automatic backup/rollback is implied.

Validate persistent restart, key availability, Web roles, model JSON/SSE, cancellation, overload, proxy/TLS and target-platform packaging. Local Windows evidence does not certify Linux/macOS behavior.
