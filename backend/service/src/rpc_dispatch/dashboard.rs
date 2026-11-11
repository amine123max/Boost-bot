use boost_core::rpc::types::{JsonRpcRequest, JsonRpcResponse};

use crate::{dashboard, RpcActor};

pub(super) fn try_handle(req: &JsonRpcRequest, actor: &RpcActor) -> Option<JsonRpcResponse> {
    let result = match req.method.as_str() {
        "dashboard/usageHistory" => super::value_or_error(crate::usage_history::read(
            actor,
            req.params.as_ref().and_then(|params|params.get("keysOnly")).and_then(|value|value.as_bool()).unwrap_or(false),
        )),
        "dashboard/adminUsageSummary" => {
            let start_ts = super::i64_param(req, "startTs");
            let end_ts = super::i64_param(req, "endTs");
            super::value_or_error(dashboard::read_admin_usage_summary(actor, start_ts, end_ts))
        }
        "dashboard/memberSummary" => {
            let user_id = super::string_param(req, "userId");
            let day_start_ts = super::i64_param(req, "dayStartTs");
            let day_end_ts = super::i64_param(req, "dayEndTs");
            super::value_or_error(dashboard::read_member_dashboard_summary(
                actor,
                user_id,
                day_start_ts,
                day_end_ts,
            ))
        }
        _ => return None,
    };

    Some(super::response(req, result))
}
