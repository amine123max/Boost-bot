# Background account eligibility

[简体中文](../../zh-CN/report/后台任务账号跳过说明.md)

## Task filters

| Task | Eligibility | Implementation |
| --- | --- | --- |
| Usage polling | Excludes disabled accounts and terminal account/workspace/region failures | [batch selection](../../../backend/service/src/usage/refresh/batch.rs) |
| Gateway keepalive | Active, gateway-eligible candidates only | [account candidates](../../../backend/core/src/storage/accounts.rs) |
| Token refresh | Nonempty refresh token and no suspended terminal/region condition | [token selection](../../../backend/core/src/storage/tokens.rs) |

These tasks do not all iterate the same account set. An imported access-token-only account can be usable for inference but ineligible for refresh.

## Diagnosis

A refresh failure may be observed only when the next provider refresh occurs. Empty keepalive or polling activity can mean that no eligible candidates remain, not that the scheduler stopped. Check account state, last error, task settings and the current batch before changing worker counts.

After correcting a proxy or region problem, explicitly restore the account according to the existing recovery flow. Do not automatically reactivate banned/deactivated accounts to increase throughput. Source filtering, model permissions and quotas still apply.

Record the current code version and the account's redacted state; line-number references become stale as code moves.
