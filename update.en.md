# Reliability and security implementation plan

[简体中文](update.md) · [Architecture](ARCHITECTURE.md) · [Load validation](docs/PERFORMANCE.md)

Baseline review: 2026-11-16, source `28e1df5`. Scope subsequently expanded from documentation design to implementation, bilingual public guides, load validation, synchronization to main and the authorized v0.5.1 release refresh. README links the latest published release rather than a fixed version.

## Goals and constraints

Retain SQLite, self-contained desktop distribution and hosted Web support. Prioritize storage contention, at-rest protection, management scheduling and inference admission/accounting. Existing actors, roles, key ownership, model groups and wallets remain authoritative; a local-first plan must not remove hosted identity boundaries.

Reuse rusqlite and the existing storage pool. Main SQLCipher and Bot encryption are separate integrations. WAL tuning does not depend on completing encryption first. New settings require defaults, bounds, persistence, restart/hot-reload behavior, runtime scope and UI exposure.

The source proposal's daily backups, retained `.bak` files, automatic restore and old-version copies are not execution authorization. No automatic backup or restore is enabled. Necessary verified staging data is a migration intermediate. Agent-controlled temporary files belong under the task's project tmp and are cleaned after processes finish. No subagents are authorized.

## Verified baseline

| Area | Existing implementation | Required correction |
| --- | --- | --- |
| SQLite | WAL/NORMAL, 3 s busy timeout | Verify selected mode, reduce contention and blocking maintenance |
| Pool | Per-path buckets, default 32 connections/16 idle/30 s acquire | Separate hot settings access, preserve management headroom, review write/read duties |
| Encryption | Ordinary bundled SQLite | SQLCipher build/key provider, verified legacy conversion and Bot coverage |
| Management RPC | One process-shared 6-active/256-waiting queue, 60 s deadline | Explicit classes, resource lanes, read channel and cross-domain barrier |
| Quota | Key token totals and wallet prechecks | Concurrent reservation, explicit rate/in-flight limits and idempotent settlement |
| Faults | Account cooldown, route quality and failover | Source circuits with bounded probes and retry accounting |
| Usage | Unique request-log token record | End-to-end finalization and wallet deduplication |
| Networking | Saved loopback/all-interface policy; explicit Compose publishing | Test IPv4/IPv6, old settings, containers and credential separation |
| Updater | Custom desktop download/apply chain | Signed metadata and payload checks across prepare/apply |
| Bot callbacks | HMAC, timestamp window and message deduplication | Durable replay state, key rotation and compatible protocol evolution |
| Lifecycle | Launcher exits the pair when either child exits | Bounded restart policy and longer controlled shutdown |

These are source observations, not proof of every deployment mode. [Architecture](ARCHITECTURE.md) identifies the owning modules.

## Delivery batches

| Batch | Priority | Scope | Exit gate |
| --- | --- | --- | --- |
| A | P0 | T02 storage, T07 RPC, T01 build/key validation | Reproducible contention/isolation tests and platform matrix |
| B | P0 | T01 encryption, T03 integrity, T04 network | Wrong key preserves data, legacy conversion validated, headless startup |
| C | P0 | T10 quota/circuits/settlement, T06 audit | Concurrent budgets, duplicate finalization and transaction consistency |
| D | P1 | T05 signed updates, T08 diagnostics, T09 rotation, T11 lifecycle | Tamper rejection, bounded failure recovery, redaction |
| E | P2 | T12 isolation, T13 replay, T14 reconciliation, T15 channels, T16 monitor | Platform/runtime acceptance and complete UI integration |

T02 and T01 can be prepared independently but must be validated together. T07 does not replace SQLite write serialization. T10/T06 depend on transaction boundaries. T08 supplies T16 metrics; T05 compatibility gates T15. Bot key/state decisions must remain consistent across T01/T12/T13. No unverified delivery dates are promised.

## Task contracts

### T01 — Encryption and key lifecycle

Owner: core/service/desktop/Bot, P0. Default builds include SQLCipher with vendored crypto. Desktop uses the OS credential provider; headless mode uses an explicit private key file. New keys use 32 cryptographically random bytes. Missing/wrong keys never generate replacements for existing encrypted data.

Every connection applies the key before schema/WAL/migrations and forces page decoding. Legacy conversion requires stopped writers, checkpoint/exclusive access, encrypted staging, integrity/schema/count/version validation and final replacement. No automatic `.bak` is retained. Specify Windows replacement behavior, interruption handling and disk-full/lock failures.

Bot remains SQLite but uses an encryption-capable Node binding. Derive per-actor keys with domain separation and send them through the owned child's private pipe. Distinguish main, Bot, workspace, logs and exports in coverage claims. Key rotation, external recovery and cross-device restore require their own protocol.

Acceptance: ordinary SQLite cannot read protected data; correct-key reopen and wrong-key preservation pass; conversion preserves rows and schema; encrypted state is shown accurately. Strings inspection is only auxiliary evidence.

### T02 — WAL, pool and writer governance

Owner: core/service, P0. Verify WAL/NORMAL/busy timeout, keep memory databases separate and document power-loss tradeoffs. Audit all direct open paths and process boundaries. Reuse the existing pool; dedicated read-only access must reject writes. One-writer/four-reader is a measurement starting point, not a mandatory SQLx rewrite.

Use short immediate transactions for read-modify-write, never hold a write transaction over network/agent work, and batch imports with explicit partial-success semantics. Checkpoint routinely with PASSIVE; do not run blocking VACUUM on every startup/checkout. Hot authentication settings must avoid repeated migrations and nested inference-pool acquisition.

Acceptance records hardware, data size, concurrent readers/writers and duration. No unhandled busy errors or lost writes in that workload; external locks and disk failures return bounded errors. Do not promise the absence of every SQLite busy condition.

### T03 — Integrity and explicit recovery

Owner: core/service/UI, P0. Authenticate encrypted pages before quick_check; run heavier checks in maintenance. Distinguish corruption, missing keys and permissions. Stop writes on damage; never silently replace current data with an older copy. Recovery preflights versions, key, integrity, disk and exclusive access, and requires explicit user selection. Backup frequency, destination, encryption and deletion remain a separate authorized work package.

### T04 — Network and credential boundaries

Owner: service/web/desktop/UI, P0. New local deployments use loopback, including reviewed IPv6 behavior. Retain explicit container networking and environment/saved-setting precedence. Internal RPC credentials, Web sessions and inference platform keys remain distinct. Test public actor spoofing, cross-role/key access, direct service bypass and Compose/Nginx publishing. Display effective listeners and restart requirements.

### T05 — Update authenticity and compatibility

Owner: desktop/release, P1. Audit the custom updater rather than assuming a Tauri plugin. Sign tag, repository, source commit, platform, size and digest using a release-only private key. Bundle the public verifier. Verify before extraction/execution and again before apply; reject unsigned, wrong-target, unknown-key or tampered packages. Define public-key rotation and schema-compatible downgrade policy. Retaining old programs/data requires explicit authorization and cannot substitute for data rollback.

### T06 — Atomic audit

Owner: core/service/Bot/UI, P0. Versioned append-only events include UTC time, trusted actor, action/resource/result, trace and redacted changes. Main changes and audit commit together; cross-database Bot events need a durable outbox or explicit consistency boundary. Reject update/delete through application paths; do not claim resistance to a filesystem owner. Authorized queries/CSV must prevent cross-role leaks and formula injection. Retention is explicit. Acceptance covers rollback and duplicate delivery.

### T07 — Resource-aware management RPC

Owner: service/web/desktop/frontend, P0. Review methods explicitly as reads, resource writes or cross-resource/global operations. Unknown methods take the conservative path; names alone do not prove read-only behavior. Resource lanes include accounts, keys, models, billing, Bot and settings, with defined cross-domain dependencies.

Budgets: six write execution slots, at most 256 waiting globally, 32 waiting per lane, 60 s queue deadline; a separate 16-active read lane rejects immediately when full. A domain waits before consuming a global slot. Cross-resource changes use a shared/exclusive barrier, with bounded lane admission to prevent monopolization. Async and legacy entrypoints share the same scheduler.

Cancellation removes waiters; queue timeout means not executed. After execution starts, timeout can mean unknown result, not rollback. Keep six outstanding frontend RPCs and disable automatic mutation replay. Acceptance covers FIFO, hot-lane isolation, barrier ordering, cancellation/panic release and shared capacity.

### T08 — Observability and diagnostics

Owner: service/web/Bot/UI, P1. Structure trace/component/outcome and queue/execution/first-byte timing while bridging existing logging. Bound queue and disk usage, redact headers/body/key SQL, avoid unbounded identity labels and expose protected metrics. Quantiles require a window and sample count. Diagnostic exports are user-triggered and preview their scope. Optional OTLP remains off by default with bounded export queues. Collector failure must not block requests.

### T09 — Credential rotation

Owner: service/web/UI, P1. Define internal RPC, Web session and channel rotation separately. Coordinate trusted clients, cache revocation and existing SSE/WebSocket behavior. Ordinary users never receive internal tokens. IP activity is recent-access evidence, not an authenticated device list. Acceptance checks immediate rejection for revoked new requests and declared long-connection handling.

### T10 — Quotas, rate, circuits and settlement

Owner: core/service/UI, P0. Separate QPS/RPM, active resource use and cumulative token/cost budgets. Defaults: 20 global QPS, burst 20, key RPM off, 24 global/8 per-model in-flight, 32 MiB body and 64 MiB buffered input. Preserve storage headroom and process-local scope.

Use monotonic token buckets and bounded authenticated-ID tables. Temporary overload returns 429/Retry-After; permanent budget exhaustion does not invent a reset time, and wallet 402 semantics remain. Token-limited text requests reserve an explicit output bound plus conservative input estimate; hidden provider context/media and crash-safe/cross-process reservation still need dedicated treatment.

Circuits isolate stable sources: 60 s window, at least 20 eligible samples, failure ratio strictly over 50%, 30 s open, one half-open logical probe. Network/5xx count; local rejection, cancellation and ordinary client 4xx do not. Provider 429 has separate cooldown. Limit total attempts/deadline and never replay delivered output or unsafe tool effects.

Server trace plus key identifies settlement; attempts remain distinct. Logs/usage commit together, duplicate finalization reuses the record and wallet deduction is idempotent. Client-supplied IDs cannot suppress billing. Acceptance includes both endpoints, JSON/SSE, tools, cancellation, half-open recovery and duplicate charging.

### T11 — Health, supervision and shutdown

Owner: start/service/web/desktop, P1. Separate liveness and readiness without full database scans per probe. Only the creating launcher supervises its children; desktop/container ownership stays distinct. Bound crash restarts with exponential backoff, stable-period reset and stop after repeated failures; configuration errors cannot restart forever. Stop admission, cancel queued work, drain execution/settlement up to 30 seconds and checkpoint after release. Verify Windows and Unix shutdown separately.

### T12 — Bot isolation and budgets

Owner: Bot/desktop/service/UI, P2. Separate process boundaries, approvals and OS sandboxing. Evaluate supported Landlock/seccomp/network isolation, Windows restricted token/AppContainer/Job Object and supported macOS mechanisms. Do not depend solely on deprecated sandbox-exec. Define filesystem/network/environment/CPU/memory/output/process-tree policies and unsupported-platform behavior. Token/time budgets terminate the owned process tree and release reservations. Acceptance is threat-model-specific, not a universal escape-proof claim.

### T13 — Callback replay and rotation

Owner: Bot/service/Nginx/UI, P2. Preserve raw-byte HMAC, constant-time comparison, timestamp window and challenge. Durable message deduplication must commit with acceptance. Introduce versioned nonces only where needed, with bounded storage, clock/skew and rollout compatibility. Rotate account secrets independently and reject caller-selected internal identity. Test restart replay and legitimate redelivery without duplicate tasks.

### T14 — Usage reconciliation

Owner: core/service/UI, P2. Implement only providers with actual bill APIs. Identify time window/timezone/currency/price version/missing usage; distinguish local estimates and final invoices. Correlate logical/upstream IDs, bound/cancel/export the job and never auto-correct balances. Exchange-rate and reporting delays must not be mislabelled duplicate billing.

### T15 — Release channels and rollback

Owner: release/desktop/UI, P2. After authenticity and compatibility gates, define stable/prerelease channels. Local users prefer explicit selection; percentage rollout requires a real stable cohort design. Reject schema-incompatible downgrade. Do not promise one-click rollback without authorized previous-version retention.

### T16 — Monitor integration

Owner: frontend/desktop/service, P2. Expose authenticated timestamped queue/in-flight/error/circuit snapshots. Distinguish frontend wait, service queue and inference activity. Unknown/stale samples stay unknown; hidden UI pauses polling. Monitoring must not saturate the queue it observes.

## Verification and progress

Use workspace and Web Cargo tests, independent desktop check/tests, frontend build/build:desktop, Bot build and actual runtime acceptance. Gateway changes require Responses/Chat Completions × JSON/SSE × tools. Deployment includes Compose/image/network and target-host nginx -t. Record exact commands, platform, data and skipped checks.

Implemented work includes SQLCipher/key providers, verified main/Bot conversion, WAL checks/read-only access, RPC lanes, input/rate/in-flight budgets, source circuits, settlement identity, signed-update verification, bounded launcher restarts and visible resource/security settings. [Performance evidence](docs/PERFORMANCE.md) records the measured workload.

Remaining design scope is not marked complete: full audit UI/atomic coverage, durable crash/cross-process quota reservation, advanced diagnostics/OTLP, rotation/replay persistence, OS sandboxing, provider reconciliation and compatibility-aware rollback require their own acceptance gates. Release notes must identify delivered behavior and these limits accurately.

### Implementation ledger · 2026-11-16

| Task | Delivered in this refresh | Remaining acceptance or capability |
| --- | --- | --- |
| T01 | Default SQLCipher, credential/key-file providers, verified legacy conversion, actor-derived encrypted Bot SQLite | All-platform installation, full interruption matrix, rotation/recovery protocol |
| T02 | Verified WAL/NORMAL/5 s timeout, actual read-only access, passive checkpoint, critical immediate transactions, isolated hot settings connection | Long-duration disk/external-writer fault matrix and complete write-entrypoint governance |
| T03 | Startup quick_check, cached integrity status, wrong-key refusal preserving the source | User-selected recovery workflow; automatic backup remains unauthorized |
| T04 | Existing layered listener, RPC token, Web session/role and platform-key boundaries preserved | Target IPv6/public TLS testing and comprehensive boundary audit |
| T05 | Ed25519 binding repo/tag/commit/platform/size/digest; prepare/apply checks and CI signing | OS signing/notarization, rotation and complete compatible downgrade |
| T06 | Atomic request/token settlement, unique settlement identity and transaction-level wallet deduplication | Comprehensive business audit, query UI and transaction coverage |
| T07 | Domain FIFO, 6 writes/16 reads, shared bounded budgets, exclusive barrier, cancellation cleanup and metrics | Long-running representative mixed business load |
| T08 | RPC counters, Prometheus, authorized manual queue snapshot and isolated load probe | OTLP, complete diagnostic chain and cancellable export |
| T09 | Keys excluded from configuration/logs; original-credential requirements | Rotation, revocation and propagation |
| T10 | QPS/RPM/concurrency/body budgets, process-local text quota reservations, source circuits and bounded probes | Durable cross-process/crash reservation and media/hidden-context budgeting |
| T11 | Owned-child exponential restart, failure cap, stable reset and 30-second exit wait | Readiness, jitter, complete admission drain and durable settlement |
| T12–T16 | Existing approval/callback/monitoring behavior retained; no claim of full implementation | OS sandbox, durable replay prevention, billing reconciliation, channels/compatible downgrade and monitor integration |

Frontend/static builds and actual Web save/reload, queue refresh, keyboard-accessible hints and 420px layout passed. Workspace Rust tests passed 512, with 3 ignored. The complete task checklists remain open until all their acceptance gates are met. See the performance record for workload, measurements and limitations.
