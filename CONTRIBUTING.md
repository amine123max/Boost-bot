# Contributing

[简体中文](CONTRIBUTING.zh-CN.md) · [Architecture](ARCHITECTURE.md) · [Validation](TESTING.md)

## Branches and scope

Base contributions on the current `main`. Use a focused topic branch (`codex/<topic>` for agent-created branches unless the user specifies otherwise). Keep product fixes, unrelated formatting and release changes separate unless they belong to one verified delivery. Do not create backup branches, commits or stashes automatically.

| Change | Owner |
| --- | --- |
| Management UI / typed clients | `frontend/src/` |
| Schema / persistence | `backend/core/` |
| Gateway / domain policy | `backend/service/` |
| Web sessions / authenticated proxy | `backend/web/` |
| Native lifecycle / IPC | `backend/desktop/` |
| Agent runtime / tools / Bot UI | `bot/` |
| Packaging / reverse proxy | `scripts/`, `docker/`, `nginx/`, `.github/` |

Read [repository rules](AGENTS.md) and the applicable [frontend](frontend/AGENTS.md) or [backend](backend/AGENTS.md) rules. Preserve server authorization, ownership, billing and model access.

## Local verification

Install the toolchain and native dependencies in [BUILDING.md](docs/BUILDING.md). Before a PR, run checks appropriate to its scope:

```sh
node scripts/check-repository.mjs
pnpm -C frontend run build
cargo test --workspace --locked
```

Bot changes additionally require `npm --prefix bot run build`; native changes require `cargo check --manifest-path backend/desktop/Cargo.toml --locked`. Use the actual Boost Web runtime for transport/UI acceptance. A Vite preview alone does not validate sessions or service routing.

Record exact commands, results, platform, test data and skipped checks. Use task-local `tmp/` storage, including subprocess TEMP/TMP/TMPDIR, and clean only that task's output after processes exit.

## Commits and pull requests

Use an imperative subject describing the resulting behavior, with optional `fix:`, `feat:` or `docs:` prefix. A PR should state the concrete trigger, before/after behavior, affected boundaries and verification. Include screenshots for meaningful UI changes and latency/overload evidence for scheduling changes. Do not include real credentials or user data.

Synchronize new commands across Rust implementation, Tauri registration, Web mapping and typed frontend wrappers. New settings need defaults, persistence and restart/hot-reload semantics. Schema changes belong in versioned migrations and need meaningful storage regression coverage.

## Documentation and review

Maintain English and Simplified Chinese public guides together. README contains positioning, technical scope, diagrams, screenshots, startup and documentation entrypoints. Protocol inventories and detailed operational contracts belong in dedicated guides. Every code path, default and release statement must be traceable to current source or recorded validation.

The repository maintainer reviews and merges changes; this guide does not define additional unpublished roles or branch protections. The existing [workflow](.github/workflows/release-all.yml) builds releases; do not imply that it is a PR CI pipeline. Report vulnerabilities through [SECURITY.md](SECURITY.md).

## Release gate

Confirm version consistency, retained licenses/notices, bilingual notes, build/runtime checks and matching asset checksums. Published tags and assets require explicit authorization to replace; do not force-update them as routine cleanup.
