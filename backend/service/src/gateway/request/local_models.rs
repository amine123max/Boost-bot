use boost_core::rpc::types::{ModelInfo, ModelsResponse};
use std::collections::HashSet;
const MODEL_CACHE_SCOPE_DEFAULT: &str = "default";

#[derive(serde::Serialize)]
struct CompatibleModelsResponse<'a> {
    object: &'static str,
    data: Vec<ApiModelInfo<'a>>,
    models: &'a [ModelInfo],
}

#[derive(serde::Serialize)]
struct ApiModelInfo<'a> {
    id: &'a str,
    object: &'static str,
    created: i64,
    owned_by: &'static str,
    display_name: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<&'a str>,
}

fn serialize_models_response_body(models: &ModelsResponse) -> String {
    let data = models
        .models
        .iter()
        .filter(|model| model.supported_in_api)
        .map(|model| ApiModelInfo {
            id: model.slug.as_str(),
            object: "model",
            created: 0,
            owned_by: "boost",
            display_name: model.display_name.as_str(),
            description: model.description.as_deref(),
        })
        .collect::<Vec<_>>();
    serde_json::to_string(&CompatibleModelsResponse {
        object: "list",
        data,
        models: &models.models,
    })
    .unwrap_or_else(|_| "{\"object\":\"list\",\"data\":[],\"models\":[]}".to_string())
}

fn serialize_models_response(models: &ModelsResponse) -> String {
    serialize_models_response_body(models)
}

fn filter_models_for_key(
    storage: &boost_core::storage::Storage,
    key_id: &str,
    mut models: ModelsResponse,
    aggregate_slugs: Option<&HashSet<String>>,
) -> Result<(ModelsResponse, bool), String> {
    if let Some(slugs) = aggregate_slugs {
        models.models.retain(|model| slugs.contains(&model.slug));
        // A catalog-wide ETag does not describe this source-specific view.
        models.extra.remove("etag");
    }
    let Some(allowed_slugs) = crate::allowed_model_slugs_for_api_key(storage, key_id)? else {
        return Ok((models, true));
    };
    Ok((
        ModelsResponse {
            models: models
                .models
                .into_iter()
                .filter(|model| allowed_slugs.contains(model.slug.as_str()))
                .collect(),
            extra: models.extra,
        },
        false,
    ))
}

fn aggregate_model_slugs_for_key(
    storage: &boost_core::storage::Storage,
    key_id: &str,
) -> Result<Option<HashSet<String>>, String> {
    let key = storage
        .find_api_key_by_id(key_id)
        .map_err(|err| err.to_string())?
        .ok_or("API key unavailable")?;
    if key.rotation_strategy != crate::apikey_profile::ROTATION_AGGREGATE_API {
        return Ok(None);
    }
    let provider = match key.protocol_type.as_str() {
        "anthropic_native" => "claude",
        "gemini_native" => "gemini",
        _ => "codex",
    };
    let source_ids: HashSet<_> = storage
        .list_aggregate_apis()
        .map_err(|err| err.to_string())?
        .into_iter()
        .filter(|api| {
            api.status == "active"
                && api.provider_type == provider
                && key
                    .aggregate_api_id
                    .as_deref()
                    .map_or(true, |id| id == api.id)
        })
        .map(|api| api.id)
        .collect();
    let slugs = storage
        .list_model_source_models(Some("aggregate_api"), key.aggregate_api_id.as_deref())
        .map_err(|err| err.to_string())?
        .into_iter()
        .filter(|model| model.status == "available" && source_ids.contains(&model.source_id))
        .map(|model| model.upstream_model)
        .collect();
    Ok(Some(slugs))
}

fn models_etag_header(models: &ModelsResponse) -> Result<Option<tiny_http::Header>, String> {
    let Some(etag) = models.extra.get("etag").and_then(serde_json::Value::as_str) else {
        return Ok(None);
    };
    let header = tiny_http::Header::from_bytes(b"etag".as_slice(), etag.as_bytes())
        .map_err(|_| "build etag header failed".to_string())?;
    Ok(Some(header))
}

/// 函数 `read_cached_models_response`
///
///
/// 时间: 2026-04-12
///
/// # 参数
/// - storage: 参数 storage
///
/// # 返回
/// 返回函数执行结果
fn read_cached_models_response(
    storage: &boost_core::storage::Storage,
) -> Result<ModelsResponse, String> {
    crate::apikey_models::read_model_options_from_storage(storage)
}

/// 函数 `maybe_respond_local_models`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// - super: 参数 super
///
/// # 返回
/// 返回函数执行结果
pub(super) fn maybe_respond_local_models(
    request: tiny_http::Request,
    trace_id: &str,
    key_id: &str,
    protocol_type: &str,
    original_path: &str,
    path: &str,
    response_adapter: super::ResponseAdapter,
    request_method: &str,
    model_for_log: Option<&str>,
    reasoning_for_log: Option<&str>,
    storage: &boost_core::storage::Storage,
) -> Result<Option<tiny_http::Request>, String> {
    let is_models_list = request_method.eq_ignore_ascii_case("GET")
        && (path == "/v1/models" || path.starts_with("/v1/models?"));
    if !is_models_list {
        return Ok(Some(request));
    }
    let context = super::local_response::LocalResponseContext {
        trace_id,
        key_id,
        protocol_type,
        original_path,
        path,
        response_adapter,
        request_method,
        model_for_log,
        reasoning_for_log,
        storage,
    };
    let (cached, aggregate_scope) = match read_cached_models_response(storage).and_then(|models| {
        aggregate_model_slugs_for_key(storage, key_id).map(|scope| (models, scope))
    }) {
        Ok(result) => result,
        Err(err) => {
            let message = crate::gateway::bilingual_error(
                "读取模型缓存失败",
                format!("model options cache read failed: {err}"),
            );
            super::local_response::respond_local_terminal_error(request, &context, 503, message)?;
            return Ok(None);
        }
    };

    // Aggregate sources are explicitly managed locally. An empty selection must
    // not trigger discovery that exposes the upstream provider's entire catalog.
    let models = if !cached.is_empty() || aggregate_scope.is_some() {
        cached
    } else {
        match super::fetch_models_for_picker() {
            Ok(fetched) if !fetched.is_empty() => {
                let merged = crate::apikey_models::merge_models_response(cached.clone(), fetched);
                if let Err(err) =
                    crate::apikey_models::save_model_options_with_storage(storage, &merged)
                {
                    log::warn!(
                        "event=gateway_model_catalog_upsert_failed scope={} err={}",
                        MODEL_CACHE_SCOPE_DEFAULT,
                        err
                    );
                }
                merged
            }
            Ok(_) => {
                let message = crate::gateway::bilingual_error(
                    "模型刷新后返回空目录",
                    "models refresh returned empty catalog",
                );
                super::local_response::respond_local_terminal_error(
                    request, &context, 503, message,
                )?;
                return Ok(None);
            }
            Err(err) => {
                let message = crate::gateway::bilingual_error(
                    "模型刷新失败",
                    format!("models refresh failed: {err}"),
                );
                super::local_response::respond_local_terminal_error(
                    request, &context, 503, message,
                )?;
                return Ok(None);
            }
        }
    };

    let (output_models, include_implicit_models) =
        filter_models_for_key(storage, key_id, models, aggregate_scope.as_ref())?;
    let output = if include_implicit_models {
        serialize_models_response(&output_models)
    } else {
        serialize_models_response_body(&output_models)
    };
    let extra_headers = models_etag_header(&output_models)?.into_iter().collect();
    super::local_response::respond_local_json_with_headers(
        request,
        &context,
        output,
        super::request_log::RequestLogUsage::default(),
        extra_headers,
    )?;
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use boost_core::storage::{AggregateApi, ApiKey, Storage};

    fn fixture(source: Option<&str>) -> Storage {
        let storage = Storage::open_in_memory().unwrap();
        storage.init().unwrap();
        storage
            .insert_api_key(&ApiKey {
                id: "directory-key".into(),
                name: None,
                model_slug: None,
                reasoning_effort: None,
                service_tier: None,
                rotation_strategy: crate::apikey_profile::ROTATION_AGGREGATE_API.into(),
                aggregate_api_id: source.map(str::to_string),
                account_plan_filter: None,
                aggregate_api_url: None,
                client_type: "codex".into(),
                protocol_type: "openai_compat".into(),
                auth_scheme: "authorization_bearer".into(),
                upstream_base_url: None,
                static_headers_json: None,
                key_hash: "directory-test-hash".into(),
                status: "active".into(),
                created_at: 1,
                last_used_at: None,
            })
            .unwrap();
        for (id, provider, status, models) in [
            ("selected", "codex", "active", vec!["flash", "pro", "glm"]),
            ("other", "codex", "active", vec!["unselected"]),
            ("disabled", "codex", "disabled", vec!["disabled-model"]),
            ("wrong-protocol", "claude", "active", vec!["claude-only"]),
        ] {
            storage
                .insert_aggregate_api(&AggregateApi {
                    id: id.into(),
                    provider_type: provider.into(),
                    supplier_name: Some(id.into()),
                    sort: 0,
                    url: "http://127.0.0.1:1/v1".into(),
                    auth_type: "apikey".into(),
                    auth_params_json: None,
                    action: Some("/chat/completions".into()),
                    model_override: None,
                    status: status.into(),
                    created_at: 1,
                    updated_at: 1,
                    last_test_at: None,
                    last_test_status: None,
                    last_test_error: None,
                    balance_query_enabled: false,
                    balance_query_template: None,
                    balance_query_base_url: None,
                    balance_query_user_id: None,
                    balance_query_config_json: None,
                    last_balance_at: None,
                    last_balance_status: None,
                    last_balance_error: None,
                    last_balance_json: None,
                })
                .unwrap();
            storage
                .upsert_discovered_model_source_models(
                    "aggregate_api",
                    id,
                    &models.into_iter().map(str::to_string).collect::<Vec<_>>(),
                    "manual",
                )
                .unwrap();
        }
        storage
    }

    #[test]
    fn aggregate_directory_lists_only_configured_models_for_selected_source() {
        let storage = fixture(Some("selected"));
        let slugs = aggregate_model_slugs_for_key(&storage, "directory-key")
            .unwrap()
            .unwrap();
        assert_eq!(
            slugs,
            HashSet::from(["flash".into(), "pro".into(), "glm".into()])
        );
        let models = ModelsResponse {
            models: ["flash", "pro", "glm", "unselected", "account-only"]
                .into_iter()
                .map(|slug| ModelInfo {
                    slug: slug.into(),
                    display_name: slug.into(),
                    ..Default::default()
                })
                .collect(),
            extra: [("etag".into(), serde_json::json!("global-catalog"))].into(),
        };
        let (filtered, _) =
            filter_models_for_key(&storage, "directory-key", models, Some(&slugs)).unwrap();
        assert_eq!(filtered.models.len(), 3);
        assert!(!filtered.extra.contains_key("etag"));
        let serialized: serde_json::Value =
            serde_json::from_str(&serialize_models_response(&filtered)).unwrap();
        assert_eq!(serialized["data"].as_array().unwrap().len(), 3);
        assert_eq!(serialized["models"].as_array().unwrap().len(), 3);
    }

    #[test]
    fn aggregate_directory_excludes_disabled_missing_and_other_protocol_sources() {
        for source in ["disabled", "wrong-protocol", "missing"] {
            let storage = fixture(Some(source));
            assert!(aggregate_model_slugs_for_key(&storage, "directory-key")
                .unwrap()
                .unwrap()
                .is_empty());
        }
        let storage = fixture(None);
        let slugs = aggregate_model_slugs_for_key(&storage, "directory-key")
            .unwrap()
            .unwrap();
        assert_eq!(slugs.len(), 4);
        assert!(!slugs.contains("disabled-model"));
        assert!(!slugs.contains("claude-only"));
    }

    #[test]
    fn aggregate_directory_does_not_change_account_key_catalog_behavior() {
        let storage = fixture(Some("selected"));
        storage
            .update_api_key_rotation_config(
                "directory-key",
                crate::apikey_profile::ROTATION_ACCOUNT,
                None,
                None,
            )
            .unwrap();
        assert!(aggregate_model_slugs_for_key(&storage, "directory-key")
            .unwrap()
            .is_none());
        storage
            .update_api_key_rotation_config(
                "directory-key",
                crate::apikey_profile::ROTATION_HYBRID,
                None,
                None,
            )
            .unwrap();
        assert!(aggregate_model_slugs_for_key(&storage, "directory-key")
            .unwrap()
            .is_none());
    }
}
