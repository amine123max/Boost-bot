# Boost Bot

[简体中文](README.zh-CN.md) · [Project](../README.md) · [Integration](INTEGRATION.md)

Boost Bot is the hosted agent workspace: conversations, memory, tasks, approvals, messaging channels, file delivery and specialist bots. Boost supplies authentication and model routing through the existing gateway.

The Company Research, PPT Master and US Stock Research workspaces include interactive previews. Previewing does not install an agent. Select **Message agent** to create or open its conversation, with saved history, streaming replies and generation controls. Select **Back to workspace** to return to its dedicated interface; both views share the same conversation.

![Boost Bot workspace](../docs/images/bot-workspace.png)

## Components

| Directory | Responsibility |
| --- | --- |
| `backend/src/` | TypeScript Node.js host, conversations, channels, task scheduling and tool orchestration |
| `backend/api/` | Optional FastAPI service ingress, with bounded async requests and SSE |
| `frontend/src/` | Vue 3 + TypeScript workspace and components |
| `frontend/styles/` | Existing design tokens and page styles |
| `frontend/compat/` | Sandboxed specialist Bot UI kit and framework-neutral bridge/Markdown helpers |
| `assets/` | Web fonts/icons, Bot templates and model metadata |
| `dsh-runtime/` | Tool-runtime dependencies and bridge plugins |
| `bots/` | Built-in specialist bots, personas and runtime skills |
| `shared/` | Avatar implementation and locale manifest shared by the frontends and backend |
| `scripts/` | Runtime build, tool preparation and resource maintenance only |
| `dist/` | Generated backend modules and production UI; ignored by Git |

Skill Markdown and templates under `bots/` are runtime resources, not general repository documentation.

## Prepare and build

From the repository root, with Node.js 22.13+:

```bash
node scripts/prepare-boost-bot.mjs
npm --prefix bot run build
```

The preparation script installs locked dependencies when needed, builds the host and shared appearance modules, and stages Node plus platform-specific tools. The Tauri build hook runs the same preparation. For a service distribution:

```bash
node scripts/stage-boost-bot.mjs <package-directory>
```

Keep the staged `boost-bot/` beside the service binaries, including its dependencies, UI, skills and license notices. Tool binaries must match the target OS and CPU architecture.

## Runtime contract

- The service starts actor-scoped hosts and supplies an existing authorized platform key through stdin; browsers do not receive model secrets.
- Web pages, static resources, downloads and SSE pass through authenticated Boost Web. The normal application entry is **12000**.
- Member sessions can chat in their own scope; server tools, task mutations, channel credentials and system configuration require administrator authority.
- Messaging channels require real platform credentials. Computer control also depends on host system permissions and a usable graphical session.
- `BOOST_BOT_ROOT` locates the prepared runtime; `BOOST_BOT_NODE` selects Node. Optional signed catalogs use `BOOST_BOT_CATALOG_URL` and `BOOST_BOT_CATALOG_PUBKEY` together.

See [integration boundaries](INTEGRATION.md) and [runtime configuration](../docs/en/report/environment-and-runtime-config.md).

## Verification

```bash
npm --prefix bot run build
node scripts/check-repository.mjs
```

Legacy Bot test fixtures, prototype scripts and the superseded Preact workspace have been removed. Sandboxed specialist previews still use their compatible UI kit. The runtime entry is `dist/backend/src/boost-host.js`; compiled web resources live in `dist/ui/`. Validate chat, channels, activity and previews in an authenticated Boost instance. See [TESTING.md](../TESTING.md), and preserve [LICENSE](LICENSE), [third-party notices](THIRD_PARTY_NOTICES.md) and [additional licenses](LICENSES/).
