# Floating monitor and local tasks

[简体中文](../../zh-CN/report/悬浮窗与本机任务监测.md) · [Desktop](../../../backend/README.md)

The monitor attaches to the current service rather than starting another instance. It docks at the top or sides of the display work area, changes orientation and returns to the main window on double-click.

## Data contract

| Metric | Source | Interpretation |
| --- | --- | --- |
| Quota | Connected service account usage | Remaining configured usage window |
| Tasks | Built-in Bot and supported local client logs | Observed execution state |
| TPS | Reported output tokens and measured elapsed time | Observed/request-average rate, not provider decode speed |
| Upload/download/memory | Service telemetry | Actual process/network measurements |

Preferences use local `boost.tray.v1` state and synchronize open windows. At least one metric remains visible; missing samples display an unknown value. Network bytes are never converted into token counts.

## Task discovery

Supported logs follow the configured Codex, Claude Code and DeepSeek Harness homes. DeepSeek compressed session logs are bounded when decoded. The monitor does not read browser conversations, alter client settings or install plugins.

Discovery runs every 10 seconds, retaining at most 16 recent files per source. A pass limits raw/compressed input to 2 MiB and decompressed output to 8 MiB. Partial lines/frames wait for a later pass. UI payloads expose state, counts and rates rather than prompts, responses or file paths.

## Progress and freshness

Explicit progress reports take priority. Without them, the display uses a time-based estimate that reaches 80% within ten minutes and waits for completion; waiting-for-input pauses accumulation. Only successful completion reaches 100%. This estimate does not become persisted task progress or TPS evidence.

Recent rate samples remain visible for at most 60 seconds with freshness metadata. When upstream usage arrives only at completion, the available value is the request average. Log silence cannot prove a task will finish; stale active entries expire.

Validate actual installed-client behavior separately from format fixtures. [codex-pacer](https://github.com/RyanZhangNTU/codex-pacer) is the reference for compatible explicit progress reporting.
