# Repository Engineering Standards

This file applies to the whole Boost repository. Read `frontend/AGENTS.md`
for frontend work and `backend/AGENTS.md` for service and desktop work.

## 1. Project Shape
- `frontend/`: Vue 3 frontend and static build configuration.
- `frontend/src/`: Vue pages, components, composables, typed API clients,
  runtime helpers, and UI state.
- `backend/desktop/`: Tauri v2 application shell, desktop lifecycle, tray/window
  behavior, native commands, and desktop RPC client code.
- `backend/core/`: SQLite migrations, storage primitives, auth helpers, and core
  usage/account data structures.
- `backend/service/`: local HTTP/RPC service, gateway routing, protocol adapters,
  account/API key/usage domains, plugins, app settings, and runtime sync.
- `backend/web/`: service-mode Web UI shell, embedded static UI serving, and
  `/api/runtime` / `/api/rpc` proxy behavior.
- `backend/start/`: service-mode launcher that starts service + web together.
- `scripts/`, `docker/`, `.github/`: build, release, probe, container, and CI
  automation.
- `bot/`: hosted Node.js agent runtime, Bot UI, channels, tools and built-in skills.
- `nginx/`: reverse-proxy configuration and deployment notes.

## 2. Ownership Boundaries
- Keep UI behavior in `frontend/src/`, desktop shell behavior in `backend/desktop/`,
  and service/gateway behavior in `backend/service/`.
- Put schema and persistence foundation changes in `backend/core/`, especially
  SQLite migrations and reusable storage helpers.
- Avoid expanding central entrypoints with unrelated orchestration. Large files
  should be treated as legacy surfaces; new substantial logic should move into
  focused modules, hooks, or domain helpers.
- Do not mix release/script changes with product behavior unless the task
  explicitly requires it.

## 3. API, RPC, and Command Sync
- Frontend code must call backend capabilities through typed wrappers in
  `frontend/src/lib/api/`.
- Desktop IPC should use the centralized `invoke` / `invokeFirst` helpers from
  `@/lib/api/transport`; do not use raw `fetch()` for desktop commands.
- Service commands that require a service address should pass parameters through
  `withAddr()`. App-shell commands such as `app_*`, `open_*`, and window/update
  helpers may omit it when no service address is needed.
- Web/service-mode fallback is allowed only through the existing transport
  stack: `transport.ts`, `transport-web-commands.ts`, `rpc-http.ts`, and
  `fetchWithRetry`.
- When adding or renaming a backend command, keep the chain synchronized:
  Rust implementation, Tauri command registry when applicable, service RPC
  dispatch/Web command mapping when applicable, and the frontend API wrapper.
- Preserve the existing underscore command names and camelCase RPC method
  mapping conventions.

## 4. Settings and Persistence
- New persisted settings need explicit defaults, storage behavior, runtime sync
  behavior, and UI/API exposure.
- Check whether a setting affects desktop mode, service mode, web mode, or all
  three before choosing where to implement it.
- New `BOOST_*` environment variables require documentation updates and
  should not bypass existing app settings unless startup-time behavior requires
  an environment-level setting.
- SQLite schema changes belong in `backend/core/migrations/` and should include
  storage-level tests when behavior is non-trivial.

## 5. Frontend and Desktop Rules
- Follow `frontend/AGENTS.md` for Vue, TypeScript, composables, themes and static output; follow `backend/AGENTS.md` for Tauri rules.
- The frontend is statically exported for the desktop shell. Keep routing and
  asset paths compatible with Vite output and per-route `index.html` files.
- The Web UI must continue to work through `boost-web`; a plain static
  page or ordinary Vite dev server is not the complete service-mode runtime.

## 6. Rust Service Rules
- Keep gateway/protocol changes localized under `backend/service/src/gateway/`
  and `backend/service/src/http/` unless shared service state is genuinely needed.
- Protocol adapter changes must consider `/v1/responses`, `/v1/chat/completions`,
  streaming SSE, non-streaming JSON, tools, and `tool_calls`.
- Prefer typed request/response structs and existing storage helpers over ad hoc
  JSON or string manipulation.
- Web access, roles, billing/account mode, and API key ownership are security
  boundaries; do not weaken checks for UI convenience.

## 7. Validation
- Frontend-only changes: run at least `pnpm -C frontend run build` and verify
  changed runtime behavior in the running application. Independent test
  directories and their package commands have been removed at the user's request.
- Desktop/static-export changes: run `pnpm -C frontend run build:desktop`.
- Rust/service changes: run `cargo test --workspace`, or the narrowest relevant
  package test only when the change is clearly isolated.
- Web shell/transport changes: add `cargo test -p boost-web` and the
  relevant runtime probe scripts when available.
- Gateway/protocol changes require targeted regression coverage for streaming,
  non-streaming, tools, and both supported OpenAI-style endpoints.
- If a validation step cannot run in the current environment, record the exact
  command and the reason it was not executed.

## 8. Documentation
- Keep `README.md`, localized docs under `docs/`, and app-level docs aligned
  with user-visible behavior, deployment modes, environment variables, and
  release/build commands.
- Root governance docs describe repository-level boundaries. App-specific
  frontend rules belong in `frontend/AGENTS.md`.
