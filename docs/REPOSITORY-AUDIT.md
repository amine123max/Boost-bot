# Repository review record

[简体中文](REPOSITORY-AUDIT.zh-CN.md) · [Validation](../TESTING.md)

## Historical scope

The 2026-11-11 review covered layout, build paths, documentation and demonstrably obsolete files. It was not an all-platform security audit. Frontend apps moved to frontend, the desktop shell to backend/desktop, service crates to backend, and Nginx to the root; Bot remained in place.

The historical record reported 36 removals: 8 unreachable frontend modules, 12 Bot scripts requiring absent upstream environments, 2 upstream-only tests and 14 superseded Markdown documents. Runtime skills, personas, templates, lockfiles, migrations and third-party notices were retained. These counts are historical, not newly executed work.

## Current review criteria

| Area | Requirement |
| --- | --- |
| Sources | Component ownership follows the current Cargo, Tauri, Vite and Node entrypoints |
| Documents | Paired languages, relative links, explicit technical boundaries and verifiable defaults |
| Validation | Separate historical suites, retained inline tests, runtime fixtures and real providers |
| Releases | Published release metadata and workflow artifacts are authoritative |
| Cleanup | Preserve user data, existing backups and other task directories |

Historical verification included standalone browser/integration suites that have since been removed. Their counts do not describe the current suite. Root validation instructions define the maintained commands and limitations.

## Corrections

The current refresh completes the root MIT grant and adds encryption-dependency notices, overall data flow and module diagrams, paired guides, signed-release contracts and load evidence. Release targets are Windows x64 portable/NSIS and macOS arm64 DMG; older statements implying every desktop platform had an installer are incorrect.

Windows host checks do not replace Linux container builds, production Nginx/TLS or macOS installation. Record results after execution; documentation maintenance alone does not establish runtime acceptance.
