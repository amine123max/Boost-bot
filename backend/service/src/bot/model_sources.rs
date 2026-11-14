//! Private, revocable host capability. Browsers never receive a source credential.
use crate::RpcActor;
use axum::{
    body::to_bytes,
    extract::Request,
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use boost_core::{rpc::types::ApiKeySummary, storage::Storage};
use rand::RngCore;
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    sync::{Mutex, OnceLock},
};

static LEASES: OnceLock<Mutex<HashMap<String, RpcActor>>> = OnceLock::new();
static PREPARE: Mutex<()> = Mutex::new(());
pub(super) struct Lease {
    pub token: String,
    retained: bool,
}
impl Lease {
    pub fn new(actor: &RpcActor) -> Result<Self, String> {
        let mut bytes = [0u8; 32];
        rand::rngs::OsRng.fill_bytes(&mut bytes);
        let token = bytes.iter().map(|b| format!("{b:02x}")).collect::<String>();
        LEASES
            .get_or_init(|| Mutex::new(HashMap::new()))
            .lock()
            .map_err(|_| "source lease unavailable")?
            .insert(token.clone(), actor.clone());
        Ok(Self {
            token,
            retained: false,
        })
    }
    pub fn retain(&mut self) {
        self.retained = true;
    }
}
impl Drop for Lease {
    fn drop(&mut self) {
        if !self.retained {
            revoke(&self.token);
        }
    }
}
pub(super) fn revoke(token: &str) {
    if let Some(leases) = LEASES.get() {
        if let Ok(mut leases) = leases.lock() {
            leases.remove(token);
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Source {
    id: String,
    kind: &'static str,
    label: String,
    models: Vec<String>,
    requires_key: bool,
}
fn eligible_keys(actor: &RpcActor) -> Result<Vec<ApiKeySummary>, String> {
    let storage = crate::storage_helpers::open_storage().ok_or("storage unavailable")?;
    let owners = storage.list_api_key_owners().map_err(|e| e.to_string())?;
    Ok(crate::apikey_list::read_api_keys_for_actor(actor)?
        .into_iter()
        .filter(|key| {
            key.protocol_type == "openai_compat"
                && match owners.get(&key.id) {
                    Some(owner) if owner.owner_kind == "user" => {
                        owner.owner_user_id.as_deref() == actor.user_id.as_deref()
                    }
                    _ => actor.is_admin(),
                }
        })
        .collect())
}
fn matches_source(key: &ApiKeySummary, id: &str) -> bool {
    if id == "account_pool" {
        key.rotation_strategy == "account_rotation"
    } else {
        id.strip_prefix("aggregate:").is_some_and(|source| {
            key.rotation_strategy == "aggregate_api_rotation"
                && key.aggregate_api_id.as_deref() == Some(source)
        })
    }
}
fn source_models(storage: &Storage, id: &str) -> Result<Vec<String>, String> {
    let active_accounts = if id == "account_pool" {
        Some(
            storage
                .list_accounts()
                .map_err(|e| e.to_string())?
                .into_iter()
                .filter(|account| account.status == "active")
                .map(|account| account.id)
                .collect::<std::collections::HashSet<_>>(),
        )
    } else {
        None
    };
    let (kind, source) = if id == "account_pool" {
        ("openai_account", None)
    } else {
        (
            "aggregate_api",
            Some(
                id.strip_prefix("aggregate:")
                    .ok_or("invalid model source")?,
            ),
        )
    };
    let mut values = storage
        .list_model_source_models(Some(kind), source)
        .map_err(|e| e.to_string())?
        .into_iter()
        .filter(|m| {
            m.status == "available"
                && active_accounts
                    .as_ref()
                    .is_none_or(|accounts| accounts.contains(&m.source_id))
        })
        .map(|m| m.upstream_model)
        .collect::<Vec<_>>();
    values.sort();
    values.dedup();
    Ok(values)
}
fn sources(actor: &RpcActor) -> Result<Vec<Source>, String> {
    let storage = crate::storage_helpers::open_storage().ok_or("storage unavailable")?;
    let keys = eligible_keys(actor)?;
    let mut items = Vec::new();
    if actor.is_admin()
        || keys
            .iter()
            .any(|key| key.status == "active" && matches_source(key, "account_pool"))
    {
        let mut models = source_models(&storage, "account_pool")?;
        if !actor.is_admin() {
            models.retain(|model| {
                keys.iter()
                    .filter(|key| key.status == "active" && matches_source(key, "account_pool"))
                    .any(|key| {
                        crate::allowed_model_slugs_for_api_key(&storage, &key.id)
                            .ok()
                            .is_some_and(|allow| allow.is_none_or(|allow| allow.contains(model)))
                    })
            });
        }
        items.push(Source {
            id: "account_pool".into(),
            kind: "account_pool",
            label: "号池".into(),
            models,
            requires_key: !keys
                .iter()
                .any(|key| key.status == "active" && matches_source(key, "account_pool")),
        });
    }
    for api in storage
        .list_aggregate_apis()
        .map_err(|e| e.to_string())?
        .into_iter()
        .filter(|api| api.status == "active" && api.provider_type == "codex")
    {
        let id = format!("aggregate:{}", api.id);
        let available = keys
            .iter()
            .any(|key| key.status == "active" && matches_source(key, &id));
        if !actor.is_admin() && !available {
            continue;
        }
        let mut models = source_models(&storage, &id)?;
        if !actor.is_admin() {
            models.retain(|model| {
                keys.iter()
                    .filter(|key| key.status == "active" && matches_source(key, &id))
                    .any(|key| {
                        crate::allowed_model_slugs_for_api_key(&storage, &key.id)
                            .ok()
                            .is_some_and(|allow| allow.is_none_or(|allow| allow.contains(model)))
                    })
            });
        }
        items.push(Source {
            id,
            kind: "aggregate_api",
            label: api
                .supplier_name
                .filter(|name| !name.trim().is_empty())
                .unwrap_or_else(|| "聚合 API".into()),
            models,
            requires_key: !available,
        });
    }
    Ok(items)
}
fn resolve(
    actor: &RpcActor,
    id: &str,
    prepare: bool,
    model: Option<&str>,
) -> Result<Value, String> {
    let _prepare = if prepare {
        Some(
            PREPARE
                .lock()
                .map_err(|_| "source preparation unavailable")?,
        )
    } else {
        None
    };
    let source = sources(actor)?
        .into_iter()
        .find(|source| source.id == id)
        .ok_or("所选模型来源已停用或不属于当前账号")?;
    if model.is_some_and(|model| !source.models.iter().any(|available| available == model)) {
        return Err("模型不在所选来源目录中".into());
    }
    let storage = crate::storage_helpers::open_storage().ok_or("storage unavailable")?;
    let setting = format!("bot.source_key.v1.{}.{}", super::scope(actor)?, id);
    let remembered = storage
        .get_app_setting(&setting)
        .map_err(|e| e.to_string())?;
    let was_remembered = remembered.is_some();
    let keys = eligible_keys(actor)?;
    let permitted = |key: &&ApiKeySummary| {
        key.status == "active"
            && matches_source(key, id)
            && model.is_none_or(|model| {
                crate::allowed_model_slugs_for_api_key(&storage, &key.id)
                    .ok()
                    .is_some_and(|allow| allow.is_none_or(|allow| allow.contains(model)))
            })
    };
    let key_id = if let Some(remembered) = remembered {
        let key = keys
            .iter()
            .find(|key| key.id == remembered)
            .ok_or("来源密钥已移除或归属发生变化")?;
        if !permitted(&key) {
            return Err("来源密钥已停用或模型不在允许范围内".into());
        }
        key.id.clone()
    } else if let Some(key) = keys.iter().find(permitted) {
        key.id.clone()
    } else if prepare && actor.is_admin() {
        let result = crate::apikey_create::create_api_key(
            Some(format!(
                "Boost Bot · {}",
                if id == "account_pool" {
                    "号池"
                } else {
                    "聚合 API"
                }
            )),
            None,
            None,
            None,
            Some("openai_compat".into()),
            None,
            None,
            Some(
                if id == "account_pool" {
                    "account_rotation"
                } else {
                    "aggregate_api_rotation"
                }
                .into(),
            ),
            id.strip_prefix("aggregate:").map(str::to_string),
            None,
            None,
            None,
        )?;
        // Bind only the specifically chosen source. Polling/catalog reads never provision keys.
        result.id
    } else {
        return Err("此来源尚未绑定可用密钥，请先由管理员保存来源设置".into());
    };
    if prepare && !was_remembered {
        storage
            .set_app_setting(&setting, &key_id, boost_core::storage::now_ts())
            .map_err(|e| e.to_string())?;
    }
    Ok(
        json!({"baseUrl":super::gateway_base_url()?,"apiKey":crate::apikey_read_secret::read_api_key_secret(&key_id)?.key}),
    )
}
pub(crate) async fn handle(request: Request) -> Response {
    let token = request
        .headers()
        .get("x-boost-bot-source-token")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let actor = LEASES
        .get()
        .and_then(|leases| leases.lock().ok()?.get(token).cloned());
    let Some(actor) = actor else {
        return (
            StatusCode::UNAUTHORIZED,
            "Bot source authentication required",
        )
            .into_response();
    };
    let result = if request.method() == axum::http::Method::GET {
        tokio::task::spawn_blocking(move || {
            sources(&actor).map(|sources| json!({"sources":sources}))
        })
        .await
    } else if request.method() == axum::http::Method::POST {
        let bytes = match to_bytes(request.into_body(), 4096).await {
            Ok(bytes) => bytes,
            Err(_) => {
                return (StatusCode::PAYLOAD_TOO_LARGE, "source request too large").into_response()
            }
        };
        let value: Value = match serde_json::from_slice(&bytes) {
            Ok(value) => value,
            Err(_) => return (StatusCode::BAD_REQUEST, "invalid source request").into_response(),
        };
        tokio::task::spawn_blocking(move || {
            resolve(
                &actor,
                value["source"].as_str().unwrap_or(""),
                value["prepare"] == true,
                value["model"].as_str(),
            )
        })
        .await
    } else {
        return StatusCode::METHOD_NOT_ALLOWED.into_response();
    };
    let mut response = match result {
        Ok(Ok(value)) => Json(value).into_response(),
        Ok(Err(error)) => (StatusCode::FORBIDDEN, Json(json!({"error":error}))).into_response(),
        Err(_) => (StatusCode::SERVICE_UNAVAILABLE, "Bot source unavailable").into_response(),
    };
    response.headers_mut().insert(
        axum::http::header::CACHE_CONTROL,
        axum::http::HeaderValue::from_static("no-store"),
    );
    response
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn host_source_lease_is_distinct_revocable_and_preserves_actor() {
        let actor = RpcActor::from_parts(Some("member"), Some("source-user"));
        let a = Lease::new(&actor).unwrap();
        let b = Lease::new(&actor).unwrap();
        assert_ne!(a.token, b.token);
        let token = a.token.clone();
        assert_eq!(
            LEASES
                .get()
                .unwrap()
                .lock()
                .unwrap()
                .get(&token)
                .unwrap()
                .user_id,
            actor.user_id
        );
        drop(a);
        assert!(!LEASES.get().unwrap().lock().unwrap().contains_key(&token));
    }
    #[test]
    fn source_endpoint_rejects_browser_and_rpc_credentials() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        runtime.block_on(async {
            for header in [
                "x-amb-token",
                "x-boost-rpc-token",
                "x-boost-bot-source-token",
            ] {
                let request = axum::http::Request::builder()
                    .uri("/_boost/bot/model-sources")
                    .header(header, "not-a-host-lease")
                    .body(axum::body::Body::empty())
                    .unwrap();
                assert_eq!(handle(request).await.status(), StatusCode::UNAUTHORIZED);
            }
        });
    }
}
