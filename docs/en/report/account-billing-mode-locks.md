# Account mode and distribution locks

[简体中文](../../zh-CN/report/账号模式与额度分发锁定策略.md) · [Security](../../../SECURITY.md)

## State boundary

Web login mode and credit distribution affect identity and accounting, not appearance. A shared-password/no-login deployment cannot express member ownership in the same way as account mode. Distribution requires account mode and valid member ownership.

| Transition | Rule |
| --- | --- |
| none/password → accounts | Explicit administrator action |
| accounts → none/password | Reject once account billing state is locked |
| distribution off → on | Requires accounts mode |
| distribution on → off | Reject once distribution state is locked |

Password mode additionally requires a configured access password. Backend checks apply even when a caller bypasses the UI.

## Lock evidence

Member users, key ownership, nonzero/frozen wallets, wallet ledger entries, member model-group assignments or request charges can establish formal account/billing use. The service returns lock state and concrete reason codes; the UI disables unsafe transitions and explains the current constraint.

## Key, wallet and model semantics

Distributed keys belong to valid members. Disabled owners, inactive wallets and insufficient balance are rejected according to the business policy. Model groups determine member access and pricing multipliers; billing-model information can precede generic fallback rules.

Administrator identity is not a member wallet shortcut. Legacy project fields do not authorize a new project-based billing mode through the UI.

## Maintenance and acceptance

Recovery is a separate privileged maintenance procedure with explicit impact, authorization and records. Do not automatically create backups, reset modes or erase historical ledgers. No ordinary Web control should disable a locked boundary.

Verify each allowed/forbidden transition, direct RPC rejection, owner/model/wallet isolation and visible reason. Current implementation: [mode guards](../../../backend/service/src/auth/app_manager.rs), [types and UI normalization](../../../frontend/src/lib/api/billing-mode-lock.ts).
