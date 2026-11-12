# Boost frontend

[简体中文](README.zh-CN.md) · [Project](../README.md) · [Build guide](../docs/BUILDING.md)

Vue 3, TypeScript and Vite provide the management interface for desktop and Web. The production Web entry is **http://localhost:12000**. The native desktop package lives separately in `backend/desktop/`.

![Boost interface](../docs/images/dashboard-dark.png)

## Layout

| Directory | Responsibility |
| --- | --- |
| `src/pages/` | Route-level management views |
| `src/components/` | Reusable controls, tables, dialogs and settings |
| `src/composables/` | UI state and runtime coordination |
| `src/lib/api/` | Typed clients and centralized Tauri/Web transport |
| `src/styles.css` | Global surfaces, accent colors and typography |
| `tests/` | Runtime and browser regressions |

`boost-theme.js` restores appearance before first paint. The Bot avatar renderer is shared with `../bot/shared/appearance/`. UI preferences use versioned device storage; service policy remains backend-owned.

## Build and test

From the repository root:

```bash
pnpm -C frontend install --frozen-lockfile
pnpm -C frontend run build
pnpm -C frontend run build:desktop
pnpm -C frontend run test:runtime
pnpm -C frontend run test:e2e
```

Static output is `frontend/out/`, including route-specific `index.html` files for Web and Tauri navigation. `build:desktop` currently delegates to the same static build. Vite alone does not provide authenticated RPC, sessions or Bot proxying.

For hot reload, use `pnpm -C frontend run dev:full`. Development-only ports and environment settings are documented in [BUILDING.md](../docs/BUILDING.md). See [engineering rules](AGENTS.md) before changing transport or UI behavior.
