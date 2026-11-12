# Boost backend

[简体中文](README.zh-CN.md) · [Project overview](../README.md) · [Architecture](../ARCHITECTURE.md)

The Rust backend owns persistence, account and key authorization, gateway routing, the authenticated Web runtime, process lifecycle, and native desktop capabilities. The public Web interface uses **port 12000** for local and hosted deployments.

| Package | Responsibility | Build scope |
| --- | --- | --- |
| `core/` — `boost-core` | SQLite migrations, storage helpers, auth primitives and shared types | Root Cargo workspace |
| `service/` — `boost-service` | HTTP/RPC, account and key domains, usage, gateway adapters, proxy management and Bot hosting | Root Cargo workspace |
| `web/` — `boost-web` | Web sessions, static UI, `/api/runtime`, RPC and authenticated Bot proxy | Root Cargo workspace |
| `start/` — `boost-start` | Starts and supervises Service + Web | Root Cargo workspace |
| `desktop/` — `Boost` | Tauri window/tray lifecycle, IPC and desktop updates | Independent Cargo package |

## Development

Run service commands from the repository root:

```bash
pnpm -C frontend run build:desktop
cargo build --locked -p boost-service -p boost-web -p boost-start
cargo run --locked -p boost-start
```

Open `http://localhost:12000`. `web/build.rs` embeds `frontend/out/` when the default `embedded-ui` feature is enabled. Rebuild Web after changing the static frontend.

For desktop work:

```bash
cd backend/desktop
cargo tauri dev
cargo tauri build
```

The Tauri package uses its own `Cargo.lock` and `target/`. Its hooks locate the root `frontend/` and `bot/`; Bot resources are bundled from the root runtime tree. Do not copy UI sources into this directory.

## Contracts

- Keep Rust handlers, Tauri registration, Web RPC mapping and `frontend/src/lib/api/` synchronized.
- Persist schema changes in `core/migrations/`; service policy belongs in `service/`, not the browser.
- Keep gateway streaming, non-streaming, tools and both OpenAI-style endpoints covered when changing protocol adapters.
- Bot hosts use actor-scoped data and authorized platform keys. See [integration](../bot/INTEGRATION.md).
- Storage and listening overrides are documented in the [runtime configuration guide](../docs/en/report/environment-and-runtime-config.md).

## Validation

```bash
cargo test --workspace --locked
cargo check --manifest-path backend/desktop/Cargo.toml --locked
node scripts/check-repository.mjs
```

Use isolated test storage. If a running application locks a build executable, report that limitation; do not terminate a user's running instance. See [testing](../TESTING.md) and [backend engineering rules](AGENTS.md).
