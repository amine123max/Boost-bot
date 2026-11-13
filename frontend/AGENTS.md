# Frontend and Desktop Engineering Standards

Applies to the Vue frontend and build configuration under `frontend/`.
Native desktop ownership and validation are documented in `../backend/AGENTS.md`.

- Use Vue 3 Composition API with strict TypeScript, Vue Router and Vite. UI state belongs in focused composables; business calls go through typed clients in `src/lib/api`.
- Keep pages in `src/pages`, shared components in `src/components` and global theme tokens in `src/styles.css`. Use local SVG assets through `BoostIcon` and the provided Boost mark.
- Use the Bahamas Bold wordmark, system body fonts and neutral Zinc dark/light surfaces with selectable accent colors. Keep controls dense, labels concise and explanatory copy limited to operationally necessary details.
- Produce static output in `frontend/out`. Preserve per-route `index.html` output for Tauri and Boost Web direct navigation. Keep the tray preview route functional.
- Preserve desktop IPC through `invoke`/`withAddr` and the existing Web RPC transport. New capabilities require synchronized Rust dispatch, Tauri command/registry, Web command mapping and typed frontend wrappers.
- Use `BoostDialog` for accessible modal focus, Escape handling, scrollable content and sticky actions. Never nest buttons. Errors, empty states and loading states must reflect real runtime state.
- Respect role permissions; global system metrics, configuration and routing controls belong to administrators. Do not weaken service authorization.
- Persist service settings through existing backend APIs. UI-only preferences need explicit defaults and versioned client storage. Redact credentials in configuration and diagnostic copy views.
- Do not fabricate accounts, traffic, IP data, latency or process metrics. Keep disposable validation fixtures in task-local `tmp/` only.
- Run `pnpm -C frontend run build`, `build:desktop` and verify behavior changes in the running application. Independent test directories, Playwright configuration and test package commands have been removed at the user's request. Rust changes require the relevant Cargo validation; broad changes require workspace tests of the retained inline unit tests.
- Keep temporary files in the project's task-specific `tmp` directory, respect the user's backup policy and do not spawn subagents without an explicit current user request.
