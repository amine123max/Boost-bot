# Troubleshooting

[简体中文](../../zh-CN/report/最小排障手册.md)

## Locate the failed boundary

| Symptom | Check first |
| --- | --- |
| Cannot open UI | Process, listener, embedded assets, Web session and proxy route |
| Storage startup fails | Key provider, permissions, lock owner, disk space and integrity |
| Unauthorized | Web session vs internal RPC credential vs platform key |
| Model unavailable | Catalog visibility, source mapping, actor permission and source state |
| 429 | Temporary rate/concurrency rejection vs cumulative quota exhaustion |
| Stream stalls | Upstream first byte, buffering, idle deadline and disconnect cleanup |
| Repeated upstream failure | Attempt chain, source cooldown/circuit and remaining candidates |

Use the [architecture](../../../ARCHITECTURE.md) to identify which process owns the failure. Correct the effective runtime setting rather than an unrelated browser preference.

## Evidence

Correlate the server trace, path, model/source ID, status and timing. Preserve redacted error summaries and test conditions; do not copy complete prompts, response bodies, credentials or private paths into a public issue. Do not reinitialize a database because a key is unavailable.

## Recovery

Retry only when the error indicates a safe retry. A management execution timeout can have an unknown result; inspect the operation before resubmitting a mutation. A provider circuit opens to reduce pressure; increasing concurrency does not repair the provider.

Validate fixes with the same reproduction and both relevant runtime modes. See [configuration](../../CONFIGURATION.md), [routing FAQ](faq-and-account-routing-rules.md) and [validation](../../../TESTING.md).
