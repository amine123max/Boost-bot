# Boost Bot

[简体中文](README.zh-CN.md) · [Project](../README.md) · [Integration](INTEGRATION.md)

Boost Bot is the hosted agent workspace: conversations, memory, tasks, approvals, messaging channels, file delivery and specialist bots. Boost supplies authentication and model routing through the existing gateway.

The Company Research, PPT Master and US Stock Research workspaces include interactive previews. Previewing does not install an agent. Select **Message agent** to create or open its conversation, with saved history, streaming replies and generation controls. Select **Back to workspace** to return to its dedicated interface; both views share the same conversation.

![Boost Bot workspace](../docs/images/bot-workspace.png)

Direct chat, channel views and history share theme-colored reply bubbles. Timestamps and reply-copy controls sit below the bubble; user bubble colors and geometry remain unchanged. Copy preserves the original text, reports clipboard failures and offers a compatible fallback without including processing traces.

Specialist template updates preserve current model sources, transport choices and user preferences, including settings saved while the old agent stops. Updates may revoke removed capabilities but never expand an existing user grant.

Aggregate upstream requests explicitly negotiate `Accept-Encoding: identity`: JSON/SSE adapters require readable bodies, and must not turn compressed input into plain SSE with a stale gzip header. This preserves content and avoids misleading HTTP 200 stream-decode failures.

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

## Settings and local collaboration

Workspace settings use searchable navigation on the left and eight sections in one scrollable page; navigation jumps to anchors and manual scrolling updates the active section. Compact screens use a left drawer with keyboard focus and Escape support. The account/footer entry and Ctrl/Cmd+, open workspace settings. Model defaults and search save together with an explicit save action; appearance preferences apply immediately in this browser (`boost.bot.preferences.v1`).

The unified gear opens a modal bound to the current Bot, with visible section navigation for identity, appearance, models, permissions/memory, background work, computer use and collaboration. It never selects a different Bot implicitly. Model, protocol, animation and approval selectors use the same themed menu; model search and provider SVG marks are local and unknown families use a neutral fallback. Colors and contours have no surrounding cards. Controls are compact and aligned; essential scope/permission/channel information stays visible while supplementary details use label-adjacent exclamation icons. The full editor confirms permission increases. The composer permission menu applies an explicitly selected preset immediately to this Bot; running work blocks permission changes, and full access is marked in orange. Failed saves preserve drafts and clearly identify partial identity saves; polling does not overwrite edits. The right information panel starts closed. Leaving settings discards unsaved changes.

The borderless composer model menu contains one model dropdown with a local provider SVG, supported reasoning controls, and a context disclosure that starts collapsed every time. A reversible spring animates disclosure height; reduced-motion settings skip it. Actual last-request context usage is separate from text estimates, and unreported capacity/tools/skills/project values stay unknown. The dedicated consumption block and status prose are omitted. reasoningEffort is persisted per Bot (auto/low/medium/high); auto inherits the existing default, and unsupported transports do not receive forced reasoning parameters.

Bot headers stay visible while scrolling. Dialogs hide scrollbar chrome while retaining wheel, touch and keyboard access. Refresh retains the conversation timeline and uses a delayed small progress ring; the initial shell has a theme-aware loading screen. Sidebar Bot rows and the single-line custom-Bot action remain compact. User avatars receive a random high-contrast color once per local username, saved in boost.bot.user-avatar.v1.<encoded username>; blocked browser storage falls back to session memory.

## Interface density and activity steps

Boost and Bot share the [dialog style guide](../frontend/src/styles/README.md). Normal, wide and confirmation dialogs use a 42px heading and aligned 16px insets. Scrollbar chrome is hidden while wheel, touch and keyboard access remain. Pure cancel/close actions finish their exit before notifying the parent; busy saves block dismissal. The Boost brand and page-title row is 60px high, without resizing the brand or avatar, and uses a separate neutral gray surface. Account provider, authorization and plan tags remain colored in light mode.

Workspace and individual Bot settings have independent 42px section banners fixed from the initial view. Only the banner divider spans the content area; form dividers keep their alignment. Actual scroll position changes the active title without remounting forms. Pages, dialogs and custom menus use critically damped translation/opacity motion without scaling containers. Reversing a disclosure clears stale velocity and prevents overshoot; reduced motion skips transitions.

Help tips start hiding immediately on pointer leave or keyboard blur, enter in 180 ms and leave in 120 ms, without a hover timer or click pinning; Escape dismisses them. Activity appears only inside the expandable processing trace. Actual structured plans use compact task rows: a running ring, completed check, or explicit failure. Without a plan, only recorded execution steps are listed. Retries and terminal errors are nested under the corresponding model request rather than presented as extra tasks. Five rows appear initially with an expansion action for the rest; no duplicate processing overview or download/expand toolbar is rendered.

## Bot model sources

The current Bot modal selects the existing default route, account pool, or a specific aggregate API. Defaults preserve the existing gateway key. Pool requests use account rotation. Aggregate selection routes through Boost authentication to an active, authorized OpenAI-compatible source and bypasses the pool. Main/auxiliary catalogs follow the source; switching requires a new model selection and resets the auxiliary model to inherit the main model.

The persisted Bot setting is settings.modelSource: default, account_pool or aggregate:<source-id>; existing Bots retain default. Running tasks block source changes. Saving clears conversation overrides and recycles the idle agent. Direct chat, channels, group members, agent and auxiliary calls use the binding. Disabled/deleted sources, revoked keys, ownership changes and unauthorized models fail explicitly without provider fallback.

Catalog reads never provision keys. Explicit administrator saves reuse an accessible key with the matching route or prepare one dedicated platform key; concurrent/repeated saves reuse it. Members can only use existing owned grants. Provider secrets remain in Boost; browsers receive descriptors and model names. A separate revocable host capability resolves gateway credentials. Browser/RPC tokens cannot use that private endpoint, and ordinary requests do not hold the key-creation lock.

Desktop and Boost Web managed hosts support this. Standalone previews without the source service explicitly retain their existing connection. Previously running hosts need an updated service restart; existing EXEs are not automatically replaced.

## Application-local collaboration

Administrators control settings.collaboration.enabled, enabled by default. group_list_bots, group_list, group_create, group_message and group_history use actor-scoped group scheduling. They cannot create external messaging groups, copy private histories or elevate permissions. Read-only Bots cannot create groups/send messages. Stable IDs deduplicate retries, Bot origins remain visible and automatic relays are limited to six. Aggregate-only model keys expose locally configured source models and preserve access filtering.

## Channel documents and file delivery

Bot dropdowns show external conversations with messages; selecting the Bot opens web chat. Creation deduplicates retries; deletion stops tasks and repairs routes while preserving shared channel credentials and custom Bot workspace files.

Feishu/WeChat attachments support text/UTF-16, PDF, DOCX, XLSX and PPTX extraction: eight attachments totaling 20 MB per turn, 80,000 text characters and 8 MB of expanded Office XML. Bounded workers support cancellation and a 15-second timeout. Truncation, download errors, unsupported formats and scanned PDFs without text are explicit; image-only documents still need OCR/vision. Agent mode retains original files.

Network-enabled agents can use channel_list_conversations/channel_send_file for explicitly requested report delivery to their own established external conversations. Read-only mode, cross-Bot recipients, out-of-workspace paths and executable files are rejected. Stable IDs deduplicate requests. Queued means outbox admission, not delivery; connectivity, platform permissions and WeChat quotas still apply.

## TPS and task progress

Native logs and Bot JSON/SSE usage calculate speed from actual output tokens and duration; modern Codex token_usage_record records are supported and duplicate counters do not refresh samples. Tool waits are excluded. Actor-readable successful gateway logs provide an explicitly labelled request mean when no local/host sample exists. Input/cache tokens and accumulated credit are not generation speed; sources are not double-counted. Samples are fresh for 15 seconds and retained means expire after 60 seconds.

Providers reporting usage only at completion cannot supply accurate TPS beforehand; character counts are not substituted. Percentages require successful structured plans, acknowledged progress tools or actual task states; unknown remains unknown.

## Verification

```bash
npm --prefix bot run build
node scripts/check-repository.mjs
```

Legacy Bot test fixtures, prototype scripts and the superseded Preact workspace have been removed. Sandboxed specialist previews still use their compatible UI kit. The runtime entry is `dist/backend/src/boost-host.js`; compiled web resources live in `dist/ui/`. Validate chat, channels, activity and previews in an authenticated Boost instance. See [TESTING.md](../TESTING.md), and preserve [LICENSE](LICENSE), [third-party notices](THIRD_PARTY_NOTICES.md) and [additional licenses](LICENSES/).
