mod items;

use serde_json::Value;

pub(crate) use items::ENV_OVERRIDE_CATALOG;
use items::{APP_SETTINGS_ENV_RESERVED_KEYS, APP_SETTINGS_ENV_UNSUPPORTED_KEYS};

const ENV_OVERRIDE_RISK_LOW: &str = "low";
const ENV_OVERRIDE_RISK_MEDIUM: &str = "medium";
const ENV_OVERRIDE_RISK_HIGH: &str = "high";
const ENV_OVERRIDE_EFFECT_SCOPE_DEPLOYMENT: &str = "deployment";
const ENV_OVERRIDE_EFFECT_SCOPE_RUNTIME_GLOBAL: &str = "runtime-global";
const ENV_OVERRIDE_EFFECT_SCOPE_REQUEST_SEMANTIC: &str = "request-semantic";

#[derive(Clone, Copy)]
pub(super) struct EnvOverrideCatalogItem {
    pub(super) key: &'static str,
    pub(super) label: &'static str,
    pub(super) scope: &'static str,
    pub(super) apply_mode: &'static str,
    pub(super) default_value: &'static str,
}

impl EnvOverrideCatalogItem {
    pub(super) const fn new(
        key: &'static str,
        label: &'static str,
        scope: &'static str,
        apply_mode: &'static str,
        default_value: &'static str,
    ) -> Self {
        Self {
            key,
            label,
            scope,
            apply_mode,
            default_value,
        }
    }
}

/// 函数 `env_override_reserved_keys`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// - crate: 参数 crate
///
/// # 返回
/// 返回函数执行结果
pub(crate) fn env_override_reserved_keys() -> &'static [&'static str] {
    APP_SETTINGS_ENV_RESERVED_KEYS
}

/// 函数 `env_override_unsupported_keys`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// - crate: 参数 crate
///
/// # 返回
/// 返回函数执行结果
pub(crate) fn env_override_unsupported_keys() -> &'static [&'static str] {
    APP_SETTINGS_ENV_UNSUPPORTED_KEYS
}

/// 函数 `editable_env_override_catalog`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// - super: 参数 super
///
/// # 返回
/// 返回函数执行结果
pub(super) fn editable_env_override_catalog(
) -> impl Iterator<Item = &'static EnvOverrideCatalogItem> {
    ENV_OVERRIDE_CATALOG
        .iter()
        .filter(|item| !is_env_override_reserved_key(item.key))
}

/// 函数 `env_override_catalog_item`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// - super: 参数 super
///
/// # 返回
/// 返回函数执行结果
pub(super) fn env_override_catalog_item(key: &str) -> Option<&'static EnvOverrideCatalogItem> {
    editable_env_override_catalog().find(|item| item.key.eq_ignore_ascii_case(key))
}

/// 函数 `is_env_override_catalog_key`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// - super: 参数 super
///
/// # 返回
/// 返回函数执行结果
pub(super) fn is_env_override_catalog_key(key: &str) -> bool {
    env_override_catalog_item(key).is_some()
}

/// 函数 `is_env_override_unsupported_key`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// - super: 参数 super
///
/// # 返回
/// 返回函数执行结果
pub(super) fn is_env_override_unsupported_key(key: &str) -> bool {
    APP_SETTINGS_ENV_UNSUPPORTED_KEYS
        .iter()
        .any(|item| item.eq_ignore_ascii_case(key))
}

/// 函数 `is_env_override_reserved_key`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// - super: 参数 super
///
/// # 返回
/// 返回函数执行结果
pub(super) fn is_env_override_reserved_key(key: &str) -> bool {
    APP_SETTINGS_ENV_RESERVED_KEYS
        .iter()
        .any(|item| item.eq_ignore_ascii_case(key))
}

fn normalized_env_key(key: &str) -> String {
    key.trim().to_ascii_uppercase()
}

fn env_override_effect_scope(key: &str) -> &'static str {
    let key = normalized_env_key(key);
    match key.as_str() {
        "BOOST_ACCOUNT_MAX_INFLIGHT"
        | "BOOST_COMPACT_API_PATH"
        | "BOOST_CODEX_IMAGE_GENERATION_AUTO_INJECT_TOOL"
        | "BOOST_CODEX_IMAGE_GENERATION_ENABLED"
        | "BOOST_CODEX_IMAGE_MAIN_MODEL"
        | "BOOST_CODEX_IMAGE_TOOL_MODEL"
        | "BOOST_FRONT_PROXY_MAX_BODY_BYTES"
        | "BOOST_GATEWAY_BLOCKED_PATHS"
        | "BOOST_HTTP_BRIDGE_OUTPUT_TEXT_LIMIT_BYTES"
        | "BOOST_PROMPT_CACHE_CAPACITY"
        | "BOOST_PROMPT_CACHE_CLEANUP_INTERVAL_SECS"
        | "BOOST_PROMPT_CACHE_TTL_SECS"
        | "BOOST_PROXY_LIST"
        | "BOOST_REQUEST_GATE_WAIT_TIMEOUT_MS"
        | "BOOST_ROUTE_HEALTH_P2C_BALANCED_WINDOW"
        | "BOOST_ROUTE_HEALTH_P2C_ENABLED"
        | "BOOST_ROUTE_HEALTH_P2C_ORDERED_WINDOW"
        | "BOOST_ROUTE_STATE_CAPACITY"
        | "BOOST_ROUTE_STATE_TTL_SECS"
        | "BOOST_STRICT_REQUEST_PARAM_ALLOWLIST"
        | "BOOST_UPSTREAM_BASE_URL"
        | "BOOST_UPSTREAM_TOTAL_TIMEOUT_MS" => ENV_OVERRIDE_EFFECT_SCOPE_REQUEST_SEMANTIC,
        "BOOST_GITHUB_TOKEN"
        | "BOOST_NO_SERVICE"
        | "BOOST_UPDATE_PRERELEASE"
        | "BOOST_UPDATE_REPO"
        | "BOOST_WEB_ADDR"
        | "BOOST_WEB_NO_OPEN"
        | "BOOST_WEB_NO_SPAWN_SERVICE"
        | "BOOST_WEB_ROOT" => ENV_OVERRIDE_EFFECT_SCOPE_DEPLOYMENT,
        _ => ENV_OVERRIDE_EFFECT_SCOPE_RUNTIME_GLOBAL,
    }
}

fn env_override_risk_level(key: &str) -> &'static str {
    match env_override_effect_scope(key) {
        ENV_OVERRIDE_EFFECT_SCOPE_REQUEST_SEMANTIC => ENV_OVERRIDE_RISK_HIGH,
        ENV_OVERRIDE_EFFECT_SCOPE_RUNTIME_GLOBAL => ENV_OVERRIDE_RISK_MEDIUM,
        _ => ENV_OVERRIDE_RISK_LOW,
    }
}

fn env_override_safety_note(key: &str) -> &'static str {
    match env_override_effect_scope(key) {
        ENV_OVERRIDE_EFFECT_SCOPE_REQUEST_SEMANTIC => {
            "会影响请求语义、上游目标、请求体限制或路由行为；只建议排障时临时修改。"
        }
        ENV_OVERRIDE_EFFECT_SCOPE_RUNTIME_GLOBAL => {
            "会影响运行时全局行为；修改后请观察请求链路和后台任务是否稳定。"
        }
        _ => "部署级兼容覆盖项；通常需要重新启动相关进程后再确认效果。",
    }
}

/// 函数 `env_override_catalog_value`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// - crate: 参数 crate
///
/// # 返回
/// 返回函数执行结果
pub(crate) fn env_override_catalog_value() -> Vec<Value> {
    editable_env_override_catalog()
        .map(|item| {
            serde_json::json!({
                "key": item.key,
                "label": item.label,
                "scope": item.scope,
                "applyMode": item.apply_mode,
                "defaultValue": super::snapshot::env_override_default_value(item.key),
                "riskLevel": env_override_risk_level(item.key),
                "effectScope": env_override_effect_scope(item.key),
                "safetyNote": env_override_safety_note(item.key),
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{env_override_catalog_value, ENV_OVERRIDE_EFFECT_SCOPE_REQUEST_SEMANTIC};

    #[test]
    fn catalog_marks_request_semantic_env_overrides_as_high_risk() {
        let catalog = env_override_catalog_value();
        let strict_allowlist = catalog
            .iter()
            .find(|item| {
                item.get("key").and_then(|value| value.as_str())
                    == Some("BOOST_STRICT_REQUEST_PARAM_ALLOWLIST")
            })
            .expect("strict allowlist catalog item");

        assert_eq!(
            strict_allowlist
                .get("riskLevel")
                .and_then(|value| value.as_str()),
            Some("high")
        );
        assert_eq!(
            strict_allowlist
                .get("effectScope")
                .and_then(|value| value.as_str()),
            Some(ENV_OVERRIDE_EFFECT_SCOPE_REQUEST_SEMANTIC)
        );
        assert!(strict_allowlist
            .get("safetyNote")
            .and_then(|value| value.as_str())
            .unwrap_or_default()
            .contains("请求语义"));

        let image_enabled = catalog
            .iter()
            .find(|item| {
                item.get("key").and_then(|value| value.as_str())
                    == Some("BOOST_CODEX_IMAGE_GENERATION_ENABLED")
            })
            .expect("image generation enabled catalog item");

        assert_eq!(
            image_enabled
                .get("riskLevel")
                .and_then(|value| value.as_str()),
            Some("high")
        );
        assert_eq!(
            image_enabled
                .get("effectScope")
                .and_then(|value| value.as_str()),
            Some(ENV_OVERRIDE_EFFECT_SCOPE_REQUEST_SEMANTIC)
        );
    }
}
