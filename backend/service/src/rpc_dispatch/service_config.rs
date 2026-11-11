use boost_core::rpc::types::{JsonRpcRequest, JsonRpcResponse};

/// 函数 `try_handle`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// - super: 参数 super
///
/// # 返回
/// 返回函数执行结果
pub(super) fn try_handle(req: &JsonRpcRequest) -> Option<JsonRpcResponse> {
    let result = match req.method.as_str() {
        "service/codexConfig/read" => super::value_or_error(crate::codex_config::read()),
        "service/telemetry" => super::as_json(crate::telemetry::snapshot()),
        "service/networkInfo" => super::value_or_error(crate::network_info::read_network_info(
            super::bool_param(req, "refresh").unwrap_or(false),
        )),
        "service/listenConfig/get" => super::as_json(serde_json::json!({
            "mode": crate::current_service_bind_mode(),
            "options": [
                crate::SERVICE_BIND_MODE_LOOPBACK,
                crate::SERVICE_BIND_MODE_ALL_INTERFACES
            ],
            "requiresRestart": true,
        })),
        "service/listenConfig/set" => {
            let requested = super::str_param(req, "mode").unwrap_or("");
            super::value_or_error(crate::set_service_bind_mode(requested).map(|applied| {
                serde_json::json!({
                    "mode": applied,
                    "options": [
                        crate::SERVICE_BIND_MODE_LOOPBACK,
                        crate::SERVICE_BIND_MODE_ALL_INTERFACES
                    ],
                    "requiresRestart": true,
                })
            }))
        }
        _ => return None,
    };

    Some(super::response(req, result))
}
