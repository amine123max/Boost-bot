# Managed runtime integration

[简体中文](INTEGRATION.zh-CN.md) · [Bot overview](README.md) · [System architecture](../ARCHITECTURE.md)

## Ownership and bootstrap

The Rust service owns actor identity, platform-key selection, source-broker leases, child-process lifecycle and authenticated proxying. Node owns conversations, agent sessions, tasks, channels, approvals and workspace tools. FastAPI/Nginx remain optional ingress layers.

A managed host starts with a bounded private stdin bootstrap record containing its data location, loopback gateway address, owned platform key, launch token, actor permissions and optional derived database key. Secrets are not placed on the command line. Node validates the trusted loopback address, registers sensitive values for redaction and holds the data-directory ownership lock before opening state.

| Boundary | Contract |
| --- | --- |
| Actor scope | Stable digest of trusted role/user identity |
| Launch token | Internal host HTTP authorization |
| Platform key | Model access, ownership and billing through Boost |
| Source broker | Server-selected authorized account/aggregate models |
| Database key | Per-actor HMAC-SHA256 derivation from the main storage key |
| Data lock | Reject concurrent ownership and unsafe relocation |

Plain standalone mode remains compatible when no encryption key is supplied. Managed encrypted mode converts and verifies existing Bot SQLite before normal startup; files, logs and arbitrary workspace outputs remain outside database encryption.

## HTTP and streaming

Web authenticates the browser and derives the actor. Service selects the matching host and forwards the request without allowing caller-selected internal identity. Original request/response bytes, query parameters and SSE framing must survive the transport chain. Disconnect cleanup must release upstream connections and admission reservations.

The optional Python gateway targets a fixed trusted Boost Web origin. It strips private actor/RPC headers, bounds active/waiting requests and input memory, and never automatically replays a mutation. See [FastAPI](backend/api/README.md) and [Nginx](../nginx/README.md).

## Models and agent execution

A Bot binds only to sources visible to its actor. Catalog discovery cannot grant model access, and source mappings preserve the distinction between account pools and aggregate connections. Agent tool permissions remain independent of model availability.

DSH sessions provide actual execution, tools and approvals. The UI distinguishes recorded structured plans from historical activity. No reasoning text, approval, task progress or completion should be invented to fill a missing event. Group handoffs retain actor membership and file-access checks.

### Conversation lifecycle

Managed conversations disable total-turn and idle deadlines, including legacy saved values; standalone defaults are also zero. Explicit stop, provider errors and individual tool/approval policies still apply. Message submission returns an acceptance receipt independently of SSE; follow-ups can enter a running agent turn or wait in conversation order. Disconnecting the browser leaves server execution running.

History regeneration updates the original user row and preserves its conversation, ID, timestamp and preceding context. The server stops and settles the old continuation, removes later rows from the current branch and rebuilds the agent execution session from retained context. An expected-content check rejects stale edits. Regeneration cannot undo external tool effects. Submission IDs suppress duplicate execution within the receipt retention window.

### AI task hierarchy

Chat, background tasks and scheduled runs share server-side AI analysis. The authorized utility model, or the selected main model as fallback, groups actual evidence into at most six major nodes and five children per node. Background dropdowns show only their own task hierarchy, states and progress; there is no separate conversation-plan card, AI heading, node count or details action. Tool records remain accessible in conversation traces and the task-management view. Processing headers show elapsed seconds from the actual turn start while running and a completed label afterward. Pending tasks and rules can be planned before execution; each actual run has separate evidence and cache identity. Successful evidence is required for completion. Percentages measure completed assigned records; unknown progress remains unset.

Analysis has two active slots, eight waiting slots, a 25-second deadline, concurrent-request coalescing, a 30-second minimum refresh interval while running and a 60-second failure cooldown. Model binding and evidence invalidate the SQLite cache, which retains 32 recent analyses per Bot. Collapsed background panels and historical traces, and hidden pages, do not initiate analysis. Failure preserves access to real execution details and a retry control.

## Storage and relocation

The Bot database persists conversations, memory, channel credentials, approvals, tasks and outbound delivery. SQLite uses WAL, a bounded lock wait and an encryption-capable native Node binding. A verified staging conversion preserves schema, rows, rowids, autoincrement high-water marks and integer/BLOB values; unsupported virtual-table layouts are rejected rather than partially converted.

Data and workspace relocation run before channels and schedulers start. Current and pending paths remain distinct; existing targets are not merged, links are checked and interruption state is explicit. Native SQLite binaries must match OS/architecture/Node ABI; cross-architecture copying is rejected by preparation.

## Packaging

`scripts/prepare-boost-bot.mjs` uses locked dependencies and builds backend/UI resources. `scripts/stage-boost-bot.mjs` includes the prepared runtime and notices in service distributions. Tauri bundles the root Bot resources; source is not duplicated inside desktop.

Built-in skills/personas/templates are executable runtime inputs, not public deployment guides. Preserve their entry filenames and semantics when changing documentation. Third-party license text remains verbatim.

## Acceptance

Verify desktop and Web actor isolation, source bindings, startup failure reporting, existing-history migration, JSON/SSE, stop/cancel, concurrent follow-ups, original-row regeneration, AI node evidence and per-run isolation, channel signatures, durable file delivery and group handoffs. Test real providers/channels separately from isolated fixtures. Follow [TESTING.md](../TESTING.md), and use only task-local temporary data.
