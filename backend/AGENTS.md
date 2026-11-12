# Backend Engineering Standards

Applies to `core/`, `service/`, `web/`, `start/` and `desktop/` under this directory.

- Keep SQLite migrations and storage primitives in `core/`; service and gateway domains in `service/`; authenticated Web proxying and embedded UI serving in `web/`; process orchestration in `start/`; native desktop lifecycle and IPC in `desktop/`.
- The four service crates belong to the root Cargo workspace. `desktop/` is an independent Cargo package with its own lockfile and target directory.
- Keep Rust commands, desktop registry, Web RPC mapping and `../frontend/src/lib/api/` synchronized.
- Preserve actor ownership, role checks, model access, billing and quota boundaries. Bot integration belongs in `service/src/bot/` and `web/src/bot_proxy.rs`.
- Desktop hooks must build `../../frontend/out` from `desktop/` and stage the root `bot/` runtime. Do not duplicate frontend sources inside the native package.
- Run `cargo test --workspace` for structural changes. Run `cargo check --manifest-path backend/desktop/Cargo.toml` for native changes and the frontend/static/browser checks specified by the root instructions when transport or packaging changes.
- Use project-local task directories under `../tmp/` for disposable files and subprocess temporary storage. Respect the user's backup and subagent policies.
