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

Managed conversations disable total-turn and idle deadlines, including legacy saved values; standalone defaults are also zero. Explicit stop, provider errors and individual tool/approval policies still apply. Web single and group chat accept messages into a bounded SQLite queue. A second message waits in order unless the user explicitly chooses **Guide** and the current agent can accept it. The pending list supports editing and removal. Reloading reconnects to the current turn; on host restart, unsent entries resume and an interrupted active entry is marked for user review before any retry.

The bundled DSH SDK adapter publishes only public text deltas from the originating session. The Vue workspace negotiates incremental SSE with an offset and reconnects from an authoritative snapshot; older subscribers still receive cumulative text events. While a reply is streaming the browser updates text without repeatedly parsing Markdown, then renders the completed reply as Markdown. A provider that only returns final JSON still produces one final response. Chat progress uses concise summaries of actual activity states without exposing raw reasoning, tool arguments or outputs. Web questions above the composer support structured choices, a custom answer and skip; closing the card leaves the question pending.

DSH and direct model chat share response rules for continuity, evidence, uncertainty, and depth appropriate to the question. Direct mode explicitly describes its lack of execution tools. If a conversation returns to DSH after a direct reply, Boost supplies recent messages from the same conversation as context. An explicitly selected model protocol is used by both paths; reasoning effort is passed only when the model and API are known to support it. The managed host's tool authorization remains separate from prompt and model settings.

After a page refresh or SSE interruption, the workspace reads conversation history and resumes from the latest snapshot automatically without submitting the message again. Task results, reminders and questions update only their own conversation. WeChat and Feishu accounts are displayed and routed according to their Bot binding.

History regeneration updates the original user row and preserves its conversation, ID, timestamp and preceding context. The server stops and settles the old continuation, removes later rows from the current branch and rebuilds the agent execution session from retained context. An expected-content check rejects stale edits. Regeneration cannot undo external tool effects. Submission IDs suppress duplicate execution within the receipt retention window.

### AI task hierarchy

Ordinary chat does not invoke task analysis. In single chat, `/task` opens the task form; creation uses the existing persisted scheduler and appears above the composer and in that Bot’s task list. A user-supplied checklist is immediately available before execution. For task or rule evidence, the authorized utility model (or the selected main model) groups up to six main nodes and five children per node. Completion requires evidence; unknown progress remains blank. Detailed diagnostics remain in task management.

Analysis has two active slots, eight waiting slots, a 15-second deadline, concurrent-request coalescing, a 30-second minimum refresh interval while running and a 60-second failure cooldown. Model binding and evidence invalidate the SQLite cache, which retains 32 recent analyses per Bot. Collapsed task panels and hidden pages do not initiate analysis.

## Storage and relocation

The Bot database persists conversations, memory, channel credentials, approvals, tasks and outbound delivery. SQLite uses WAL, a bounded lock wait and an encryption-capable native Node binding. A verified staging conversion preserves schema, rows, rowids, autoincrement high-water marks and integer/BLOB values; unsupported virtual-table layouts are rejected rather than partially converted.

Data and workspace relocation run before channels and schedulers start. Current and pending paths remain distinct; existing targets are not merged, links are checked and interruption state is explicit. Native SQLite binaries must match OS/architecture/Node ABI; cross-architecture copying is rejected by preparation.

## Packaging

`scripts/prepare-boost-bot.mjs` uses locked dependencies and builds backend/UI resources. `scripts/stage-boost-bot.mjs` includes the prepared runtime and notices in service distributions. Tauri bundles the root Bot resources; source is not duplicated inside desktop.

Built-in skills/personas/templates are executable runtime inputs, not public deployment guides. Preserve their entry filenames and semantics when changing documentation. Third-party license text remains verbatim.

## Acceptance

Verify desktop and Web actor isolation, source bindings, startup failure reporting, existing-history migration, JSON/SSE, stop/cancel, concurrent follow-ups, original-row regeneration, AI node evidence and per-run isolation, channel signatures, durable file delivery and group handoffs. Test real providers/channels separately from isolated fixtures. Follow [TESTING.md](../TESTING.md), and use only task-local temporary data.
