# Contributing / 贡献约定

Read the root [engineering rules](AGENTS.md), then the relevant [frontend](frontend/AGENTS.md) or [backend](backend/AGENTS.md) rules.

| Change | Location |
| --- | --- |
| Management UI | `frontend/src/` |
| Native desktop | `backend/desktop/` |
| Gateway and service domains | `backend/service/` |
| Schema and storage foundation | `backend/core/` |
| Authenticated Web shell | `backend/web/` |
| Agent runtime and Bot UI | `bot/` |
| Deployment | `docker/`, `nginx/`, `.github/`, `scripts/` |

Keep changes focused. Synchronize backend commands, native registration, Web mapping and frontend wrappers. Add regression coverage for meaningful behavior, preserve static direct navigation and server-side authorization, and run the checks in [TESTING.md](TESTING.md).

改动应聚焦对应职责；涉及命令链时同步 Rust、Tauri 注册、Web 映射及前端封装。更新中英文首页时保持功能、版本来源、截图和访问端口一致。新截图应来自当前运行页面，演示数据需明确标识。

Use a task-specific root `tmp/` directory for disposable output and subprocess temporary storage. Do not commit credentials, runtime databases, dependency trees or generated build caches. Preserve Bot skills, third-party notices and licenses. Report vulnerabilities through [SECURITY.md](SECURITY.md).
