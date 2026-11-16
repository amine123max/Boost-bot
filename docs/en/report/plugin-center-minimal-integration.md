# Plugin integration checklist

[简体中文](../../zh-CN/report/插件中心最小接入说明.md)

## Required decisions

| Area | Decision |
| --- | --- |
| Market | Builtin or explicit trusted private/custom source |
| Manifest | Stable ID, supported version/runtime, script source |
| Capabilities | Minimum explicit permissions |
| Task | Valid entrypoint, schedule, interval, initial enabled state |
| Operations | Update/disable/uninstall behavior and redacted logs |

Follow the [full contract](plugin-center-integration-and-interfaces.md). A supported catalog is an array or an object with an items array. Do not publish pseudocode as a runnable plugin example, or use hidden administrator privileges to make a manifest appear functional.

## Validation order

1. Parse the catalog and reject invalid/unsupported metadata.
2. Install using the typed application path.
3. Exercise every requested capability and verify unrequested ones fail.
4. Run one task manually, then inspect its actual result and logs.
5. Change schedule/enablement, restart and verify persistence.
6. Disable/uninstall without touching unrelated data.

Rhai permissions and transport authorization are separate. Production network/cleanup plugins need isolated acceptance data and an explicitly reviewed trusted source.
