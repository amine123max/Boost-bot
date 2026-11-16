# Validation

[简体中文](TESTING.zh-CN.md) · [Build](docs/BUILDING.md) · [Engineering plan](update.en.md)

The repository retains inline Rust unit tests. Standalone test directories and dedicated test package commands were removed at the user's request. Compilation establishes type/build compatibility in the tested environment, not acceptance of every provider, operating system or release package.

## Commands by scope

| Scope | Command or requirement |
| --- | --- |
| Documents, layout and assets | node scripts/check-repository.mjs; node scripts/check-documentation.mjs |
| Frontend | pnpm -C frontend run build |
| Desktop static output | pnpm -C frontend run build:desktop |
| Bot | npm --prefix bot run build |
| Rust workspace | cargo test --workspace --locked |
| Web transport | cargo test -p boost-web --locked |
| Native Rust | cargo check --manifest-path backend/desktop/Cargo.toml --locked |
| Release version | node scripts/check-release-version.mjs v0.5.1; use the intended tag |
| Target deployment | Compose configuration, image build, nginx -t, TLS, SSE and WebSocket |

Default SQLCipher builds use vendored OpenSSL. Windows requires native Strawberry Perl and a C++ toolchain; MSYS Perl is unsuitable. Prepare the native Bot driver for the target operating system, architecture and Node ABI.

## Runtime acceptance

Use isolated accounts, databases and ports. Do not terminate a user's running instance.

1. Check Web sign-in, roles, direct navigation and Tauri/Web transports.
2. Exercise Bot creation, streamed conversation, cancellation, history, channels and approvals.
3. Cover Responses and Chat Completions, JSON/SSE, tools/tool_calls, upstream errors, cancellation and duplicate settlement.
4. Exercise mixed WAL readers/writers, real read-only constraints, wrong keys, legacy conversion, damage and concurrent debit idempotency.
5. Check RPC resource ordering, cross-domain isolation, exclusive barriers, bounded admission and cancellation cleanup.
6. Verify current screenshots, dark/light themes, keyboard access and narrow layouts.

## Latency and capacity

Build the current debug binaries, then run the isolated mock probe:

```sh
cargo build --locked -p boost-service -p boost-web
node scripts/probe-resource-limits.mjs
```

The probe owns its processes and disposable project-local tmp directory. It checks RPC load, inference saturation, JSON/SSE with tools, cancellation, circuits and encrypted reopen. It uses no real-provider credentials. The [performance record](docs/PERFORMANCE.md) explains measurements and scope.

Record hardware, revision, build mode, payload size, concurrency, duration and mock/real source. Report throughput, P50/P95/P99, successes/rejections/timeouts, peak memory and resource cleanup. Measure management and inference separately; saturation must produce bounded waiting or explicit rejection. Local mock results are not a real-provider first-byte SLA. Process budgets are independent; rate, cumulative quota, concurrency and memory need separate checks.

## Outputs and cleanup

Use task-specific project tmp directories for scripts, databases, logs and subprocess TEMP/TMP/TMPDIR. Save final screenshots under docs/images. Before cleanup, verify process exit and deletion ownership; remove only this task's temporary files. Record passed, skipped and blocked steps distinctly, including exact unexecuted commands and reasons.
