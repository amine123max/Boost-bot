# Runtime configuration contracts

[简体中文](../../zh-CN/report/环境变量与运行配置说明.md)

## Configuration layers

Existing process environment values take precedence over the first executable-adjacent boost.env/Boost.env/.env file, persisted application settings and supported defaults. The loader fills missing values; it does not make the working-directory .env authoritative.

The complete advanced catalog and bootstrap/body/ingress tables are maintained in [Configuration](../../CONFIGURATION.md). This guide explains relationships and effective behavior rather than duplicating those defaults.

## Persistent settings

| Domain | Storage / behavior |
| --- | --- |
| Listener | Saved address/bind mode plus explicit environment; restart required |
| Routing/model defaults | Service-owned settings with runtime synchronization |
| Resource limits | gateway.resource_limits.v1; validated complete object, applies to new admissions |
| Storage encryption | Credential metadata/private key provider; restart-only conversion |
| UI appearance | Device-local or supported persisted UI settings; no authorization effect |
| Update source | Build-time trust anchor, never a runtime override |

A generic environment editor cannot set bootstrap database/key/RPC credentials. Dedicated settings control reserved gateway and worker fields. Show the effective source and restart requirement when values differ.

## Proxy and worker budgets

A single HTTP/SOCKS proxy can be used directly; managed multi-node/native-protocol paths require a compatible sing-box core. Discovery is local-first, explicit update/download validates required features and managed configuration. Pinned-source failures must not silently fall back to direct AI traffic.

Gateway in-flight/rate limits, management queues, storage connections, HTTP workers and FastAPI limits are separate. Increasing one can simply move contention to another. Preserve the default storage headroom and measure representative workloads before changing limits.

## Logs and privacy

Trace input queues are bounded (default 4096, effective range 1–65536). Zero does not restore an unbounded queue. Body previews should remain off unless deliberately diagnosing isolated data. Keys, cookies, launch URLs and provider credentials stay out of public exports.

## Diagnosis and deployment

An edited environment file requires the correct executable location and restart. Runtime settings may be shadowed by an explicit process value. Containers require consistent mounted data and key providers across Service/Web. Use the [build guide](../../BUILDING.md), [resource evidence](../../PERFORMANCE.md) and [troubleshooting](minimal-troubleshooting-guide.md).
