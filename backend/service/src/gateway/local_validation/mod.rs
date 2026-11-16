use boost_core::storage::ConversationBinding;
use bytes::Bytes;
use reqwest::Method;
use tiny_http::Request;

use super::conversation_binding::RouteConversationSource;

mod auth;
mod io;
mod request;

pub(super) struct LocalValidationResult {
    pub(super) admission: Option<super::request_limits::Admission>,
    pub(super) trace_id: String,
    pub(super) incoming_headers: super::IncomingHeaderSnapshot,
    pub(super) storage: crate::storage_helpers::StorageHandle,
    pub(super) original_path: String,
    pub(super) passthrough_path: String,
    pub(super) path: String,
    pub(super) passthrough_body: Bytes,
    pub(super) body: Bytes,
    pub(super) is_stream: bool,
    pub(super) has_prompt_cache_key: bool,
    pub(super) request_shape: Option<String>,
    pub(super) protocol_type: String,
    pub(super) rotation_strategy: String,
    pub(super) aggregate_api_id: Option<String>,
    pub(super) account_plan_filter: Option<String>,
    pub(super) response_adapter: super::ResponseAdapter,
    pub(super) gemini_stream_output_mode: Option<super::GeminiStreamOutputMode>,
    pub(super) tool_name_restore_map: super::ToolNameRestoreMap,
    pub(super) request_method: String,
    pub(super) key_id: String,
    pub(super) platform_key_hash: String,
    pub(super) local_conversation_id: Option<String>,
    pub(super) route_conversation_id: Option<String>,
    pub(super) route_conversation_source: Option<RouteConversationSource>,
    pub(super) conversation_binding: Option<ConversationBinding>,
    pub(super) model_for_log: Option<String>,
    pub(super) reasoning_for_log: Option<String>,
    pub(super) service_tier_for_log: Option<String>,
    pub(super) effective_service_tier_for_log: Option<String>,
    pub(super) gateway_mode_for_log: Option<String>,
    pub(super) method: Method,
}

#[derive(Debug)]
pub(super) struct LocalValidationError {
    pub(super) status_code: u16,
    pub(super) message: String,
    pub(super) retry_after: Option<u64>,
}

impl LocalValidationError {
    /// 函数 `new`
    ///
    ///
    /// 时间: 2026-04-02
    ///
    /// # 参数
    /// - super: 参数 super
    ///
    /// # 返回
    /// 返回函数执行结果
    pub(super) fn new(status_code: u16, message: impl Into<String>) -> Self {
        Self {
            status_code,
            message: message.into(),
            retry_after: None,
        }
    }
}

impl From<super::request_limits::Rejected> for LocalValidationError {
    fn from(error: super::request_limits::Rejected) -> Self {
        Self {
            status_code: 429,
            message: error.reason.to_string(),
            retry_after: Some(error.retry_after),
        }
    }
}

/// 函数 `prepare_local_request`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// - super: 参数 super
///
/// # 返回
/// 返回函数执行结果
pub(super) fn prepare_local_request(
    request: &mut Request,
    trace_id: String,
    debug: bool,
) -> Result<LocalValidationResult, LocalValidationError> {
    let mut admission =
        super::request_limits::global().enter(crate::storage_helpers::storage_max_connections())?;
    let body = io::read_request_body(request, &mut admission)?;
    let incoming_headers = super::IncomingHeaderSnapshot::from_request(request);
    let platform_key = io::extract_platform_key_or_error(request, &incoming_headers, debug)?;

    let storage = auth::open_storage_or_error()?;
    let api_key = auth::load_active_api_key(&storage, &platform_key, request.url(), debug)?;

    let mut validated = request::build_local_validation_result(
        request,
        trace_id,
        incoming_headers,
        storage,
        body,
        api_key,
    )?;
    admission.authenticate(&validated.key_id, validated.model_for_log.as_deref())?;
    if validated.request_method == "POST"
        && !validated.path.contains("countTokens")
        && !validated.path.contains("count_tokens")
    {
        admission.reserve_quota(
            &validated.storage,
            &validated.key_id,
            validated.passthrough_body.as_ref(),
        )?;
    }
    validated.admission = Some(admission);
    Ok(validated)
}
