# Repository review / 仓库审查

Review date / 审查日期：2026-11-11。

## Scope / 范围

This pass reviews repository organization, build-path consistency, documentation, and demonstrably obsolete files. It is not a complete security audit or a claim of runtime compatibility on every platform.

本次审查覆盖结构、路径、文档与可确认的冗余文件；不将目录整理等同于完整安全审计或全平台运行验证。

| Previous location | Current location |
| --- | --- |
| `apps/` frontend | `frontend/` |
| `apps/src-tauri/` | `backend/desktop/` |
| `crates/` | `backend/` service packages |
| `docker/nginx/` | `nginx/` |
| `bot/` | Retained / 保留 |

The root Cargo workspace, native dependency paths, Tauri frontend/hooks/resources, Web embedding, development/rebuild scripts, Dockerfiles, release paths and documentation references use the new layout. The desktop Cargo package remains independent.

## Cleanup / 清理

Removed **36 reviewed files** in this task:

| Category | Count | Evidence |
| --- | --- | --- |
| Frontend modules | 8 | Unreachable from the application entry/import graph and no external symbol consumers found |
| Upstream-only Bot scripts | 12 | Required absent Electron, upstream site/docs, design-source or vendor trees; not part of hosted Boost preparation |
| Upstream release/documentation tests | 2 | Exercised only removed, unavailable upstream workflows and documents |
| Obsolete or duplicate Markdown | 14 | Completed TODO/integration notes and release manuals replaced by maintained guides |

Frontend removals: `plugin-client.ts`, `startup-snapshot.ts`, `appearance.ts`, `dashboard/format.ts`, and the unused `utils/clipboard.ts`, `reset-credits.ts`, `static-routes.ts`, `timeout.ts`.

Bot removals: legacy Magpie setup/build, Electron smoke and ASAR packaging checks, upstream README/release/locale-documentation checks, and icon builders whose original design trees are absent. The current hosted runtime, tool preparation, UI localization checks and integration regressions remain.

Runtime skills, personas, templates, dependency lockfiles, database migrations, third-party notices and licenses were retained. Existing release outputs, user data, unrelated task directories and existing backups were not included in this cleanup.

## Documentation / 文档

- Root English and Chinese READMEs now share feature scope, Release source, screenshots, image spacing, Star history and the normal **12000** Web entry.
- Frontend, backend and Bot have focused English/Chinese guides. Build, testing, architecture and deployment details have dedicated entrypoints.
- Manual indexes and broken local links were repaired. Missing upstream screenshots were removed from older manuals rather than presented as available.
- README screenshots come from the running UI with isolated fixture data; the Bot screenshot comes from the actual hosted workspace against a local mock endpoint.
- GitHub release metadata was queried directly. At review time `amine123max/Boost-bot` had no published Releases; the README uses a dynamic Release badge and the repository's actual release links.

## Verification / 验证

Detailed checks are described in [TESTING.md](../TESTING.md).

| Check | Result |
| --- | --- |
| Frontend production/static build | Passed |
| Frontend runtime regressions | 42 passed |
| Complete frontend browser suite, including documentation capture | 41 passed |
| Bot build and isolated browser/host smoke | Passed |
| Selected Bot regressions | 162 passed across 5 test files |
| Rust library suite (serial) | Passed; service suite reported 1,032 passed and 6 ignored |
| Core/Web/Start package regressions | Passed |
| Native `cargo check` | Passed |
| `cargo tauri build --debug --no-bundle --ci` | Passed, including Bot/frontend hooks and native executable output |
| All-in-one and split Docker Compose configuration | Passed |
| Repository structure, resources and Markdown links | Passed for maintained guides |

The full `cargo test --workspace --locked -- --test-threads=1` attempt was blocked by Windows access denial when rebuilding the already-running `target/debug/boost-service.exe`. The running instance was not terminated. Library and targeted Core/Web/Start checks were run separately.

Browser fixtures and outdated page selectors were aligned with the current management UI. The existing connection regression also exposed that batch actions included disabled upstreams; batch testing and balance refresh now select active connections only.

## Follow-up observations / 后续事项

1. The root `LICENSE` currently contains only `MIT License`; complete the applicable copyright and license grant before distributing source. Existing third-party notices remain intact.
2. The native manifest's historic Rust minimum is not the minimum for every backend API. Build with current stable Rust; this environment uses 1.96.
3. Docker Compose configuration was validated. Container image builds, Nginx TLS deployment and macOS/Linux installer execution were not performed on this Windows host.
4. Some retained operating manuals contain historical endpoint and release context. Treat the module guides and current source/configuration as the structural reference; the [release workflow](../.github/workflows/release-all.yml) defines current packaging targets.
