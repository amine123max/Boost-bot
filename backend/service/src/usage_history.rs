use crate::{storage_helpers, RpcActor};
use boost_core::rpc::types::{DashboardTokenUsageResult, UsageHistoryDay, UsageHistoryResult};
use boost_core::storage::TokenUsageRollup;

pub(crate) fn read(actor: &RpcActor, keys_only: bool) -> Result<UsageHistoryResult, String> {
    crate::initialize_storage_if_needed()?;
    let user_id = if actor.is_admin() {
        None
    } else {
        Some(actor.user_id.as_deref().ok_or_else(|| {
            "permission_denied: usage history requires a user session".to_string()
        })?)
    };
    let storage =
        storage_helpers::open_storage().ok_or_else(|| "open storage failed".to_string())?;
    let history = storage
        .read_usage_history(keys_only, user_id)
        .map_err(|err| format!("read usage history failed: {err}"))?;
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let today_usage = history
        .days
        .iter()
        .find(|(day, _)| day == &today)
        .map(|(_, usage)| response_usage(usage))
        .unwrap_or_default();
    Ok(UsageHistoryResult {
        today,
        today_usage,
        totals: response_usage(&history.totals),
        days: history
            .days
            .iter()
            .map(|(day, usage)| UsageHistoryDay {
                day: day.clone(),
                usage: response_usage(usage),
            })
            .collect(),
        has_undated_history: history.has_undated_history,
    })
}

fn response_usage(usage: &TokenUsageRollup) -> DashboardTokenUsageResult {
    DashboardTokenUsageResult {
        input_tokens: usage.input_tokens,
        cached_input_tokens: usage.cached_input_tokens,
        output_tokens: usage.output_tokens,
        reasoning_output_tokens: usage.reasoning_output_tokens,
        total_tokens: usage.total_tokens,
        estimated_cost_usd: usage.estimated_cost_usd,
        request_count: usage.request_count,
        success_count: usage.success_count,
        error_count: usage.error_count,
    }
}
