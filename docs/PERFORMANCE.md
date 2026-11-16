# Latency and overload validation

[简体中文](PERFORMANCE.zh-CN.md) · [Architecture](../ARCHITECTURE.md) · [Resource configuration](CONFIGURATION.md)

## Scope and method

The resource probe launches isolated Service and Web processes, generates a local authorized model/source fixture, measures HTTP latency and injects overload/failure. It does not contact a real model provider. All disposable databases, keys and logs remain under project tmp.

```sh
cargo build --locked -p boost-service -p boost-web -p boost-start
node scripts/probe-resource-limits.mjs
```

Use `--output=<path>` to save a JSON report and `--keep` only for deliberate debugging. The probe closes its owned children and cleans its task directory by default. It never terminates a user's running instance.

## Recorded environment

Local validation: Windows x64, AMD Ryzen 7 8745H, 16 logical processors, about 23.3 GiB system memory, Node 24.12.0, Rust debug binaries. The baseline mock model delays 25 ms; separate phases use slower calls, injected 503s and healthy-source failover. Values below are an observed run, not a provider SLA or a hardware-independent capacity claim.

| Direct management concurrency | Requests | P50 ms | P95 ms | P99 ms | Requests/s |
| --- | --- | --- | --- | --- | --- |
| 1 | 256 | 0.72 | 1.54 | 2.00 | 1173.7 |
| 6 | 256 | 2.94 | 6.55 | 9.58 | 1810.2 |
| 16 | 256 | 5.45 | 13.50 | 14.41 | 2412.4 |
| 32 | 256 | 9.56 | 15.02 | 16.32 | 3220.5 |
| 64 | 256 | 17.55 | 31.58 | 32.24 | 3331.8 |

All 1,280 management requests in this phase succeeded. The method reads listener configuration, so this is a lightweight management-path measurement, not a bulk-import/database-write benchmark.

## Isolation and overload

| Scenario | Observed result |
| --- | --- |
| Web RPC, 6 clients / 60 requests | P50 2.72 ms, P95 5.73 ms, P99 5.76 ms |
| Management during 8 slow model calls | 60/60 successful; P99 12.02 ms |
| 32-client inference burst / 128 requests | 13 successful, 115 explicit 429; P99 79.74 ms across all responses |
| 8-second saturation, 32 clients, default 20 QPS | 22,640 attempts: 179 successful, 22,461 explicit 429; P99 24.45 ms across all responses |
| Saturation memory sample | Peak observed service RSS 74,862,592 bytes, about 71.4 MiB |
| Queue after work completes | No waiting writes or active writes; the telemetry request itself occupies one read slot |

Burst and saturation quantiles include rejected requests. They must not be interpreted as successful model completion latency. The default burst permits initial work above steady-state QPS.

The Web-path correction removed repeated connection/schema initialization from hot authentication lookups. An earlier local comparison measured roughly 51 ms Web RPC P50; the revised settings connection reduced it to about 2 ms under the same fixture. Settings access is isolated from the inference pool to avoid nested pool exhaustion.

## Functional fault checks

- Responses and Chat Completions JSON/SSE, including supplied tool definitions.
- Missing platform-key rejection.
- Source circuit opens and later requests skip that source without another network attempt.
- A separate healthy source serves failover traffic.
- Cancelled HTTP streaming releases capacity after backend cleanup.
- The complete main database converts and reopens with an explicit private key file.
- Separate Bot conversion verifies schema, Unicode, BLOBs, 64-bit integers, rowids, autoincrement, triggers and version metadata.
- Storage inline regression holds a read snapshot while 8 writers complete 800 immediate transactions.
- Duplicate concurrent wallet settlement deducts once, and usage failure rolls back the settlement identity.

## Practical limits

Admission is process-local. Multiple service processes, large output bodies, hidden provider context, media tokens, filesystem failure and real upstream latency need their own deployment tests. An eight-second saturation sample is not a long-duration leak proof. The documented input-buffer budget does not include every protocol-adapter copy, allocator overhead or output payload.

Maintain finite active/waiting work, inspect explicit rejection rates and tune one resource boundary at a time. Increasing Nginx keepalive or worker counts does not increase upstream capacity. Use production builds and representative payloads for deployment sizing.

Raw measurements: [Windows debug mock report](benchmarks/resource-limits-windows-debug.json).
