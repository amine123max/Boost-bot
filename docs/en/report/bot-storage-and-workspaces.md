# Bot storage and workspaces

[简体中文](../../zh-CN/report/Bot沙箱与目录管理.md) · [Bot integration](../../../bot/INTEGRATION.md)

## Separate storage domains

| Domain | Contents | Relocation |
| --- | --- | --- |
| Main Boost database | Accounts, aggregate keys, request logs and billing | Main runtime configuration |
| Bot data | Conversations, Bot/channel settings, memory and execution state | Bot data-location setting |
| Bot workspace | Installed agent files, tasks, rules and handoff outputs | Bot workspace-location setting |
| Shared runtime | Node, tools and dependencies | Packaging/runtime cache |

Paths entered in the Web UI refer to the server host. Use an absolute parent directory; empty input keeps the current location. A selected parent produces `Boost/bots/<workspace>/data` or `Boost/bots/<workspace>/workspaces/<bot>`, without adding a duplicate Boost directory.

## Migration semantics

Changes apply after restart, before databases, channels or task schedulers start. Current and pending locations remain distinguishable. Existing targets are not merged or overwritten. Same-volume moves use filesystem rename; cross-volume data copy uses restricted destination permissions and SHA-256 verification before switching.

Legacy locations retain compatibility links for historical file references. Links are not backup copies. Overlapping source/target/workspace roots, active ownership locks and unsupported filesystem entries stop migration rather than widening access. Interrupted migrations use their own state record; failures preserve a usable original location.

Windows destination permissions are restricted to the current user, SYSTEM and administrators; Unix uses private permissions. A known migration can extend Bot startup waiting to ten minutes, while ordinary startup keeps its existing shorter deadline.

## Identity and encryption

Workspace identity remains stable when the data directory moves. Independently configured workspaces remain where configured; default workspaces inside the data directory move with it. Main account/billing storage is not part of Bot relocation.

With main-database encryption enabled, managed Bot hosts receive independent per-actor keys through their private bootstrap pipe and convert the Bot database when next started. Moving that database still requires access to the original parent key and actor scope. Workspace files and external exports are outside database encryption.

## Context display

Context usage uses the latest measured request rather than summing history. Classified messages/tools/system/skills/project values share one display; unknown categories remain unknown, and residual measured usage is unclassified. Estimates carry an approximation marker.

Capacity prefers model-catalog data, then the actual execution window, then the labelled default 128,000-token window. An execution budget is not a provider maximum. Unmeasured tools or hidden context must not be presented as exact usage.
