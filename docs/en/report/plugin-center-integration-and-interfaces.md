# Plugin architecture and contracts

[简体中文](../../zh-CN/report/插件中心对接与接口清单.md)

## Layers and permissions

The plugin center separates catalog distribution, installed state, scheduled tasks and the Rhai execution runtime. Market modes are builtin, private and custom. Builtin ignores a remote source; private/custom use the administrator-configured catalog URL.

| Manifest field | Type/default | Contract |
| --- | --- | --- |
| id | Required string | Stable unique plugin identity |
| name/version | String; ID / 0.0.0 fallback | Display and update metadata |
| scriptBody/scriptUrl | One source | Inline or fetched Rhai program |
| permissions | String array | Explicitly requested runtime capabilities |
| tasks | Task array | Entrypoint, schedule kind, interval and enablement |
| manifestVersion/runtimeKind | 1 / rhai | Supported manifest/runtime version |
| category/tags/homepage | Optional metadata | No permission grant |

Catalog responses support an array or an items object. Install/update validates script and manifest; permissions do not arise from a friendly name or catalog membership. Global plugin administration stays privileged.

## Execution boundary

Only registered capability functions are exposed. Settings reads, network requests and account cleanup require corresponding permissions. Logging is available but must redact secrets. A Rhai sandbox does not imply full OS isolation for other application tools.

Tasks persist their schedule/configuration and emit bounded diagnostic logs. Manual runs, retries and periodic execution must have explicit effects; avoid duplicate cleanup or billing. Plugin uninstall/disable must not silently remove unrelated user data.

## Interface maintenance

Use the [generated internal inventory](system-internal-interface-inventory.md) for current method names and typed wrappers. Do not maintain a second stale Tauri/RPC table here. Implementation: [catalog](../../../backend/service/src/plugin/catalog.rs), [runtime](../../../backend/service/src/plugin/runtime.rs), [store](../../../backend/service/src/plugin/store.rs).

## Acceptance

Validate unsupported manifests, unreachable/script sources, permission denial, schedule changes, explicit manual runs, disable/uninstall and log redaction. An empty custom source should remain empty rather than falling back to an unintended market.
