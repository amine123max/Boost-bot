# Usage and accounting

[简体中文](USAGE.zh-CN.md) · [Quota design](en/report/quota-management-design.md) · [Gateway](../backend/service/src/gateway/README.md)

## Metrics and time

| Metric | Meaning |
| --- | --- |
| Home totals | Current service-local calendar day |
| Key totals | Lifetime detailed and rolled-up token statistics |
| Reported tokens | Usage supplied by the upstream/adapter |
| Estimated cost | Local price rules and selected billing model, in USD |
| Cache hit rate | Cached input divided by eligible input; unknown without a denominator |
| Day comparison | Signed change against the prior service-local day; rate changes use percentage points |

A missing sample is not zero. Sparse dated days can mean zero activity; undated legacy usage remains unknown for calendar placement. A failed statistics request shows an error rather than fabricated totals.

## Persistence and authorization

Daily history is independent of normal request-detail retention. Migration 074 preserves/backfills available dated history. Older compacted undated records remain in lifetime totals but cannot be assigned a date; any confirmed lower-bound count is explicitly marked.

Members receive only their own keys' statistics. Administrators can access broader summaries. Frontend filtering is not an authorization boundary.

## Settlement and budgets

A server trace/key identity deduplicates finalization. Request logs and token statistics commit atomically; wallet request charges deduct once under an immediate transaction. A new logical server request remains separately billable.

Rate, concurrency and cumulative budgets are different controls. Token-limited text requests need a positive output bound for conservative reservation; provider-hidden context/media and cross-process/crash-safe reservations have additional limits. Local cost remains an estimate until reconciled with a supported provider bill.

## Display

The heatmap represents dated usage on one consistent scale and supports horizontal navigation. Visible-range totals and lifetime totals have different scopes. Color is supplemented by dates, values and accessible labels.

Source: [daily history](../backend/core/src/storage/usage_history.rs), [token statistics](../backend/core/src/storage/request_token_stats.rs), [settlement](../backend/core/src/storage/request_logs.rs), [pricing](../backend/service/src/quota/model_pricing.rs).
