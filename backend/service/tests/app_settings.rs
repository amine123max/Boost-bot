use boost_core::storage::{
    now_ts, ApiKey, ApiKeyOwner, AppWalletLedgerEntry, Storage, UserModelGroup,
};
use serde_json::json;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

mod support;
use support::test_env_guard;

const CODEX_IMAGE_AUTO_INJECT_TOOL_ENV: &str =
    "BOOST_CODEX_IMAGE_GENERATION_AUTO_INJECT_TOOL";

#[test]
fn main_window_close_action_defaults_persists_and_validates() {
    with_temp_db(|_| {
        assert_eq!(boost_service::current_main_window_close_action(), "ask");
        for action in ["exit", "floating", "minimize", "ask"] {
            let result = boost_service::app_settings_set(Some(&json!({"mainWindowCloseAction": action}))).unwrap();
            assert_eq!(result["mainWindowCloseAction"], action);
            assert_eq!(boost_service::current_main_window_close_action(), action);
        }
        assert!(boost_service::app_settings_set(Some(&json!({"mainWindowCloseAction": "invalid"}))).is_err());
        assert_eq!(boost_service::current_main_window_close_action(), "ask");
    });
}

#[test]
fn legacy_local_service_address_migrates_without_overriding_explicit_environment() {
    with_temp_db(|_| {
        boost_service::set_saved_service_addr(Some("localhost:48760")).unwrap();
        assert_eq!(boost_service::current_saved_service_addr(), "localhost:12580");
        assert_eq!(boost_service::default_web_listener_addr(), "localhost:12000");
        boost_service::set_saved_service_addr(Some("remote.example:48760")).unwrap();
        assert_eq!(boost_service::current_saved_service_addr(), "remote.example:48760");
        boost_service::set_saved_service_addr(Some("localhost:23456")).unwrap();
        assert_eq!(boost_service::current_saved_service_addr(), "localhost:23456");
        let _env = override_env_vars(&[("BOOST_SERVICE_ADDR", Some("localhost:48760"))]);
        assert_eq!(boost_service::current_saved_service_addr(), "localhost:48760");
    });
}

const ISOLATED_RUNTIME_ENV_KEYS: &[&str] = &[
    CODEX_IMAGE_AUTO_INJECT_TOOL_ENV,
    "BOOST_SERVICE_ADDR",
    "BOOST_WEB_ADDR",
    "BOOST_ROUTE_STRATEGY",
    "BOOST_FREE_ACCOUNT_MAX_MODEL",
    "BOOST_MODEL_FORWARD_RULES",
    "BOOST_QUOTA_GUARD_ENABLED",
    "BOOST_QUOTA_GUARD_5H_MIN_REMAINING_PERCENT",
    "BOOST_QUOTA_GUARD_WEEKLY_MIN_REMAINING_PERCENT",
    "BOOST_QUOTA_GUARD_ALLOW_ALL_LOW_FALLBACK",
    "BOOST_LOW_QUOTA_THRESHOLD_PERCENT",
    "BOOST_ENABLE_REQUEST_COMPRESSION",
    "BOOST_ORIGINATOR",
    "BOOST_RESIDENCY_REQUIREMENT",
    "BOOST_UPSTREAM_PROXY_URL",
    "BOOST_UPSTREAM_STREAM_TIMEOUT_MS",
    "BOOST_UPSTREAM_TOTAL_TIMEOUT_MS",
    "BOOST_SSE_KEEPALIVE_INTERVAL_MS",
    "BOOST_USAGE_POLLING_ENABLED",
    "BOOST_USAGE_POLL_INTERVAL_SECS",
    "BOOST_WARMUP_CRON_ENABLED",
    "BOOST_WARMUP_CRON_EXPRESSION",
    "BOOST_GATEWAY_KEEPALIVE_ENABLED",
    "BOOST_GATEWAY_KEEPALIVE_INTERVAL_SECS",
    "BOOST_TOKEN_REFRESH_POLLING_ENABLED",
    "BOOST_TOKEN_REFRESH_POLL_INTERVAL_SECS",
    "BOOST_TOKEN_REFRESH_AHEAD_SECS",
    "BOOST_USAGE_REFRESH_WORKERS",
    "BOOST_HTTP_WORKER_FACTOR",
    "BOOST_HTTP_WORKER_MIN",
    "BOOST_HTTP_STREAM_WORKER_FACTOR",
    "BOOST_HTTP_STREAM_WORKER_MIN",
];

/// 函数 `unique_temp_db_path`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// 无
///
/// # 返回
/// 返回函数执行结果
fn unique_temp_db_path() -> PathBuf {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock")
        .as_nanos();
    std::env::temp_dir().join(format!("boost-app-settings-test-{unique}.db"))
}

/// 函数 `reset_runtime_defaults`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// 无
///
/// # 返回
/// 无
fn reset_runtime_defaults() {
    let _ = boost_service::set_service_bind_mode(
        boost_service::SERVICE_BIND_MODE_LOOPBACK,
    );
    let _ = boost_service::app_settings_set(Some(&json!({
        "routeStrategy": "balanced",
        "freeAccountMaxModel": "gpt-5.2",
        "modelForwardRules": "",
        "quotaGuard": {
            "enabled": true,
            "primaryMinRemainingPercent": 5,
            "secondaryMinRemainingPercent": 10,
            "allowAllLowQuotaFallback": true
        },
        "gatewayOriginator": "codex_cli_rs",
        "gatewayUserAgentVersion": boost_service::default_gateway_user_agent_version(),
        "gatewayResidencyRequirement": "",
        "appearancePreset": "classic",
        "lightweightModeOnCloseToTray": false,
        "upstreamProxyUrl": "",
        "upstreamStreamTimeoutMs": 600000,
        "upstreamTotalTimeoutMs": 0,
        "sseKeepaliveIntervalMs": 15000,
        "envOverrides": {},
        "backgroundTasks": {
            "usagePollingEnabled": true,
            "usagePollIntervalSecs": 600,
            "gatewayKeepaliveEnabled": true,
            "gatewayKeepaliveIntervalSecs": 180,
            "tokenRefreshPollingEnabled": true,
            "tokenRefreshPollIntervalSecs": 60,
            "usageRefreshWorkers": 4,
            "httpWorkerFactor": 4,
            "httpWorkerMin": 8,
            "httpStreamWorkerFactor": 1,
            "httpStreamWorkerMin": 2
        }
    })));
}

/// 函数 `with_temp_db`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// - test: 参数 test
///
/// # 返回
/// 无
fn with_temp_db(test: impl FnOnce(&PathBuf)) {
    let _guard = test_env_guard();
    let db_path = unique_temp_db_path();
    let previous_db_path = std::env::var("BOOST_DB_PATH").ok();
    std::env::set_var("BOOST_DB_PATH", &db_path);
    boost_service::initialize_storage_if_needed().expect("init storage");
    reset_runtime_defaults();
    let isolated_env_vars = ISOLATED_RUNTIME_ENV_KEYS
        .iter()
        .map(|key| (*key, None))
        .collect::<Vec<_>>();
    let _isolated_env = override_env_vars(&isolated_env_vars);

    test(&db_path);

    reset_runtime_defaults();
    if let Some(value) = previous_db_path {
        std::env::set_var("BOOST_DB_PATH", value);
    } else {
        std::env::remove_var("BOOST_DB_PATH");
    }
    let _ = std::fs::remove_file(&db_path);
}

struct EnvRestore(Vec<(String, Option<std::ffi::OsString>)>);

impl Drop for EnvRestore {
    /// 函数 `drop`
    ///
    ///
    /// 时间: 2026-04-02
    ///
    /// # 参数
    /// - self: 参数 self
    ///
    /// # 返回
    /// 无
    fn drop(&mut self) {
        for (key, value) in self.0.drain(..) {
            if let Some(value) = value {
                std::env::set_var(&key, value);
            } else {
                std::env::remove_var(&key);
            }
        }
    }
}

/// 函数 `override_env_vars`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// - vars: 参数 vars
///
/// # 返回
/// 返回函数执行结果
fn override_env_vars(vars: &[(&str, Option<&str>)]) -> EnvRestore {
    let previous = vars
        .iter()
        .map(|(key, _)| ((*key).to_string(), std::env::var_os(key)))
        .collect::<Vec<_>>();
    for (key, value) in vars {
        if let Some(value) = value {
            std::env::set_var(key, value);
        } else {
            std::env::remove_var(key);
        }
    }
    EnvRestore(previous)
}

/// 函数 `read_env_overrides_map`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// - db_path: 参数 db_path
///
/// # 返回
/// 返回函数执行结果
fn read_env_overrides_map(db_path: &PathBuf) -> serde_json::Map<String, serde_json::Value> {
    let storage = Storage::open(db_path).expect("open storage");
    let raw = storage
        .get_app_setting(boost_service::APP_SETTING_ENV_OVERRIDES_KEY)
        .expect("read env overrides")
        .expect("env overrides exists");
    serde_json::from_str(&raw).expect("parse env overrides json")
}

fn create_member_user(username: &str) -> boost_service::AppUserPublicResult {
    boost_service::create_app_user(boost_service::AppUserCreateInput {
        username: username.to_string(),
        password: "password123".to_string(),
        display_name: Some(username.to_string()),
        role: Some("member".to_string()),
        initial_balance_credit_micros: None,
    })
    .expect("create member user")
}

fn create_admin_user(username: &str) -> boost_service::AppUserPublicResult {
    boost_service::create_app_user(boost_service::AppUserCreateInput {
        username: username.to_string(),
        password: "password123".to_string(),
        display_name: Some(username.to_string()),
        role: Some("admin".to_string()),
        initial_balance_credit_micros: None,
    })
    .expect("create admin user")
}

fn assert_account_mode_locked_with_reason(reason: &str) {
    let status = boost_service::app_auth_status_value().expect("auth status");
    assert_eq!(
        status["billingModeLock"]["accountModeLocked"], true,
        "account mode should be locked for {reason}: {status}"
    );
    assert_eq!(
        status["billingModeLock"]["distributionLocked"], true,
        "distribution should be locked for {reason}: {status}"
    );
    let reasons = status["billingModeLock"]["reasons"]
        .as_array()
        .expect("lock reasons");
    assert!(
        reasons.iter().any(|item| item.as_str() == Some(reason)),
        "missing lock reason {reason}: {reasons:?}"
    );
    let err = boost_service::app_settings_set(Some(&json!({
        "webAuthMode": "none"
    })))
    .expect_err("locked account mode should reject downgrade");
    assert!(
        err.contains("account_billing_mode_locked"),
        "unexpected error: {err}"
    );
}

fn seed_api_key_owner(storage: &Storage) {
    let now = now_ts();
    storage
        .insert_api_key(&ApiKey {
            id: "key-lock-owner".to_string(),
            name: Some("Lock owner key".to_string()),
            model_slug: Some("gpt-5".to_string()),
            reasoning_effort: None,
            service_tier: None,
            rotation_strategy: "account_rotation".to_string(),
            aggregate_api_id: None,
            account_plan_filter: None,
            aggregate_api_url: None,
            client_type: "codex".to_string(),
            protocol_type: "openai_compat".to_string(),
            auth_scheme: "authorization_bearer".to_string(),
            upstream_base_url: None,
            static_headers_json: None,
            key_hash: "hash-lock-owner".to_string(),
            status: "active".to_string(),
            created_at: now,
            last_used_at: None,
        })
        .expect("insert api key");
    storage
        .upsert_api_key_owner(&ApiKeyOwner {
            key_id: "key-lock-owner".to_string(),
            owner_kind: "project".to_string(),
            owner_user_id: None,
            project_id: None,
            updated_at: now,
        })
        .expect("insert api key owner");
}

fn seed_wallet_ledger(storage: &Storage, entry_kind: &str, amount_credit_micros: i64) {
    let wallet = storage
        .ensure_wallet_for_owner("wal-lock", "project", "project-lock")
        .expect("ensure wallet");
    storage
        .adjust_wallet_balance(&AppWalletLedgerEntry {
            id: format!("wl-{entry_kind}"),
            wallet_id: wallet.id,
            entry_kind: entry_kind.to_string(),
            amount_credit_micros,
            balance_after_credit_micros: 0,
            request_log_id: None,
            api_key_id: None,
            pricing_rule_id: None,
            raw_usage_json: None,
            note: Some("lock signal".to_string()),
            created_by_user_id: None,
            created_at: now_ts(),
        })
        .expect("insert wallet ledger entry");
}

#[test]
fn app_settings_roundtrip_account_manager_mode_and_bootstrap() {
    with_temp_db(|_| {
        let snapshot = boost_service::app_settings_set(Some(&json!({
            "webAuthMode": "accounts",
            "distributionEnabled": true
        })))
        .expect("save settings");
        assert_eq!(snapshot["webAuthMode"], "accounts");
        assert_eq!(snapshot["distributionEnabled"], true);
        assert_eq!(snapshot["appUsersConfigured"], false);

        let login = boost_service::bootstrap_app_admin(
            "admin-user",
            "password123",
            Some("Admin User"),
        )
        .expect("bootstrap admin");
        assert!(login.token.starts_with("cms_"));
        assert_eq!(login.user.username, "admin-user");
        assert_eq!(login.user.role, "admin");
        assert!(login.user.wallet.is_none());

        let resolved = boost_service::resolve_app_user_session(&login.token)
            .expect("resolve session")
            .expect("active session");
        assert_eq!(resolved.user.id, login.user.id);

        let status = boost_service::app_auth_status_value().expect("auth status");
        assert_eq!(status["mode"], "accounts");
        assert_eq!(status["distributionEnabled"], true);
        assert_eq!(status["appUsersConfigured"], true);
        assert_eq!(status["appUserCount"], 1);
    });
}

#[test]
fn app_settings_rejects_password_mode_without_password() {
    with_temp_db(|_| {
        let result = boost_service::app_settings_set(Some(&json!({
            "webAuthMode": "password"
        })));
        assert!(result.is_err());

        let snapshot = boost_service::app_settings_set(Some(&json!({
            "webAccessPassword": "password123",
            "webAuthMode": "password"
        })))
        .expect("save password mode");
        assert_eq!(snapshot["webAuthMode"], "password");
        assert_eq!(snapshot["webAccessPasswordConfigured"], true);
    });
}

#[test]
fn app_settings_allows_trial_account_mode_downgrade_before_lock() {
    with_temp_db(|_| {
        let snapshot = boost_service::app_settings_set(Some(&json!({
            "webAuthMode": "accounts"
        })))
        .expect("enable account mode");
        assert_eq!(snapshot["webAuthMode"], "accounts");
        assert_eq!(snapshot["billingModeLock"]["accountModeLocked"], false);

        let snapshot = boost_service::app_settings_set(Some(&json!({
            "webAuthMode": "none"
        })))
        .expect("downgrade to none before formal use");
        assert_eq!(snapshot["webAuthMode"], "none");

        let snapshot = boost_service::app_settings_set(Some(&json!({
            "webAccessPassword": "password123",
            "webAuthMode": "accounts"
        })))
        .expect("enable account mode again");
        assert_eq!(snapshot["webAuthMode"], "accounts");

        let snapshot = boost_service::app_settings_set(Some(&json!({
            "webAuthMode": "password"
        })))
        .expect("downgrade to password before formal use");
        assert_eq!(snapshot["webAuthMode"], "password");
    });
}

#[test]
fn app_settings_formal_use_signals_lock_account_mode() {
    with_temp_db(|_| {
        boost_service::app_settings_set(Some(&json!({
            "webAuthMode": "accounts"
        })))
        .expect("enable account mode");
        create_member_user("member-lock");
        assert_account_mode_locked_with_reason("member_users");
    });

    with_temp_db(|db_path| {
        boost_service::app_settings_set(Some(&json!({
            "webAuthMode": "accounts"
        })))
        .expect("enable account mode");
        let storage = Storage::open(db_path).expect("open storage");
        storage.init().expect("init storage");
        seed_api_key_owner(&storage);
        assert_account_mode_locked_with_reason("api_key_owners");
    });

    with_temp_db(|db_path| {
        boost_service::app_settings_set(Some(&json!({
            "webAuthMode": "accounts"
        })))
        .expect("enable account mode");
        let storage = Storage::open(db_path).expect("open storage");
        storage.init().expect("init storage");
        seed_wallet_ledger(&storage, "manual_adjustment", 1);
        assert_account_mode_locked_with_reason("wallet_balance");
    });

    with_temp_db(|db_path| {
        boost_service::app_settings_set(Some(&json!({
            "webAuthMode": "accounts"
        })))
        .expect("enable account mode");
        let storage = Storage::open(db_path).expect("open storage");
        storage.init().expect("init storage");
        seed_wallet_ledger(&storage, "manual_adjustment", 0);
        assert_account_mode_locked_with_reason("wallet_ledger");
    });

    with_temp_db(|db_path| {
        boost_service::app_settings_set(Some(&json!({
            "webAuthMode": "accounts"
        })))
        .expect("enable account mode");
        let admin = create_admin_user("admin-model-group-lock");
        let storage = Storage::open(db_path).expect("open storage");
        storage.init().expect("init storage");
        storage
            .replace_user_model_groups_for_group(
                "mg_default",
                &[UserModelGroup {
                    user_id: admin.id,
                    group_id: "mg_default".to_string(),
                    status: "active".to_string(),
                    expires_at: None,
                    created_at: now_ts(),
                    updated_at: now_ts(),
                }],
            )
            .expect("assign model group");
        assert_account_mode_locked_with_reason("model_group_assignments");
    });

    with_temp_db(|db_path| {
        boost_service::app_settings_set(Some(&json!({
            "webAuthMode": "accounts"
        })))
        .expect("enable account mode");
        let storage = Storage::open(db_path).expect("open storage");
        storage.init().expect("init storage");
        seed_wallet_ledger(&storage, "request_charge", 0);
        assert_account_mode_locked_with_reason("request_charges");
    });
}

#[test]
fn app_settings_distribution_requires_accounts_mode() {
    with_temp_db(|_| {
        let err = boost_service::app_settings_set(Some(&json!({
            "distributionEnabled": true
        })))
        .expect_err("distribution should require account mode");
        assert!(
            err.contains("distribution_requires_accounts_mode"),
            "unexpected error: {err}"
        );

        let err = boost_service::set_distribution_enabled(true)
            .expect_err("shortcut should require account mode");
        assert!(
            err.contains("distribution_requires_accounts_mode"),
            "unexpected error: {err}"
        );
    });
}

#[test]
fn app_settings_locks_distribution_after_formal_use() {
    with_temp_db(|_| {
        let snapshot = boost_service::app_settings_set(Some(&json!({
            "webAuthMode": "accounts",
            "distributionEnabled": true
        })))
        .expect("enable account distribution");
        assert_eq!(snapshot["distributionEnabled"], true);

        create_member_user("member-distribution-lock");
        let status = boost_service::app_auth_status_value().expect("auth status");
        assert_eq!(status["billingModeLock"]["distributionLocked"], true);

        let err = boost_service::app_settings_set(Some(&json!({
            "distributionEnabled": false
        })))
        .expect_err("locked distribution should reject app settings downgrade");
        assert!(
            err.contains("distribution_mode_locked"),
            "unexpected error: {err}"
        );

        let err = boost_service::set_distribution_enabled(false)
            .expect_err("locked distribution should reject shortcut downgrade");
        assert!(
            err.contains("distribution_mode_locked"),
            "unexpected error: {err}"
        );
    });
}

/// 函数 `sync_runtime_settings_from_storage_preserves_process_env_when_override_not_persisted`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// 无
///
/// # 返回
/// 无
#[test]
fn sync_runtime_settings_from_storage_preserves_process_env_when_override_not_persisted() {
    with_temp_db(|db_path| {
        let storage = Storage::open(db_path).expect("open storage");
        storage
            .set_app_setting(
                boost_service::APP_SETTING_ENV_OVERRIDES_KEY,
                "",
                now_ts(),
            )
            .expect("clear env overrides");
        drop(storage);

        let _env = override_env_vars(&[(
            "BOOST_UPSTREAM_BASE_URL",
            Some("http://127.0.0.1:41002"),
        )]);

        boost_service::sync_runtime_settings_from_storage();

        assert_eq!(
            std::env::var("BOOST_UPSTREAM_BASE_URL")
                .ok()
                .as_deref(),
            Some("http://127.0.0.1:41002")
        );
    });
}

/// 函数 `sync_runtime_settings_from_storage_preserves_explicit_process_env_over_persisted_override`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// 无
///
/// # 返回
/// 无
#[test]
fn sync_runtime_settings_from_storage_preserves_explicit_process_env_over_persisted_override() {
    with_temp_db(|db_path| {
        let storage = Storage::open(db_path).expect("open storage");
        storage
            .set_app_setting(
                boost_service::APP_SETTING_ENV_OVERRIDES_KEY,
                &serde_json::to_string(&json!({
                    "BOOST_WEB_ADDR": "localhost:48761"
                }))
                .expect("serialize env overrides"),
                now_ts(),
            )
            .expect("save env overrides");
        drop(storage);

        let _env = override_env_vars(&[("BOOST_WEB_ADDR", Some("0.0.0.0:48761"))]);

        boost_service::sync_runtime_settings_from_storage();

        assert_eq!(
            std::env::var("BOOST_WEB_ADDR").ok().as_deref(),
            Some("0.0.0.0:48761")
        );
    });
}

#[test]
fn sync_runtime_settings_from_storage_upgrades_legacy_image_auto_inject_default() {
    with_temp_db(|db_path| {
        let storage = Storage::open(db_path).expect("open storage");
        storage
            .set_app_setting(
                boost_service::APP_SETTING_ENV_OVERRIDES_KEY,
                &serde_json::to_string(&json!({
                    CODEX_IMAGE_AUTO_INJECT_TOOL_ENV: "0"
                }))
                .expect("serialize env overrides"),
                now_ts(),
            )
            .expect("save legacy env overrides");
        drop(storage);

        let _env = override_env_vars(&[(CODEX_IMAGE_AUTO_INJECT_TOOL_ENV, None)]);

        boost_service::sync_runtime_settings_from_storage();

        assert_eq!(
            std::env::var(CODEX_IMAGE_AUTO_INJECT_TOOL_ENV)
                .ok()
                .as_deref(),
            Some("1")
        );
        let stored = read_env_overrides_map(db_path);
        assert_eq!(
            stored
                .get(CODEX_IMAGE_AUTO_INJECT_TOOL_ENV)
                .and_then(|value| value.as_str()),
            Some("1")
        );
    });
}

#[test]
fn app_settings_gateway_mode_is_no_longer_a_persisted_runtime_setting() {
    with_temp_db(|db_path| {
        let storage = Storage::open(db_path).expect("open storage");
        storage
            .set_app_setting("gateway.mode", "enhanced", now_ts())
            .expect("save legacy gateway mode");
        drop(storage);

        boost_service::sync_runtime_settings_from_storage();

        let snapshot = boost_service::app_settings_set(Some(&json!({
            "gatewayMode": "enhanced"
        })))
        .expect("legacy gatewayMode patch should be ignored");

        assert!(
            snapshot.get("gatewayMode").is_none(),
            "app settings snapshot must not expose gatewayMode as a product setting"
        );
    });
}

/// 函数 `app_settings_set_persists_snapshot_and_password_hash`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// 无
///
/// # 返回
/// 无
#[test]
fn app_settings_set_persists_snapshot_and_password_hash() {
    with_temp_db(|db_path| {
        let snapshot = boost_service::app_settings_set(Some(&json!({
            "updateAutoCheck": false,
            "closeToTrayOnClose": true,
            "lightweightModeOnCloseToTray": true,
            "codexCliGuideDismissed": true,
            "lowTransparency": true,
            "theme": "dark",
            "appearancePreset": "classic",
            "serviceAddr": "127.0.0.1:4999",
            "serviceListenMode": "all_interfaces",
            "routeStrategy": "rr",
            "freeAccountMaxModel": "gpt-5.3-codex",
            "modelForwardRules": "spark*=gpt-5.4-mini",
            "quotaGuard": {
                "enabled": true,
                "primaryMinRemainingPercent": 7,
                "secondaryMinRemainingPercent": 12,
                "allowAllLowQuotaFallback": false
            },
            "gatewayOriginator": "codex_cli_rs_test",
            "gatewayUserAgentVersion": "0.101.2",
            "gatewayResidencyRequirement": "us",
            "upstreamProxyUrl": "http://127.0.0.1:7890",
            "upstreamStreamTimeoutMs": 654321,
            "upstreamTotalTimeoutMs": 120000,
            "sseKeepaliveIntervalMs": 17000,
            "backgroundTasks": {
                "usagePollingEnabled": false,
                "usagePollIntervalSecs": 900,
                "gatewayKeepaliveEnabled": false,
                "gatewayKeepaliveIntervalSecs": 240,
                "tokenRefreshPollingEnabled": true,
                "tokenRefreshPollIntervalSecs": 120,
                "usageRefreshWorkers": 6,
                "httpWorkerFactor": 5,
                "httpWorkerMin": 9,
                "httpStreamWorkerFactor": 2,
                "httpStreamWorkerMin": 3
            },
            "webAccessPassword": "secret-pass"
        })))
        .expect("save app settings");

        assert_eq!(
            snapshot
                .get("updateAutoCheck")
                .and_then(|value| value.as_bool()),
            Some(false)
        );
        assert_eq!(
            snapshot
                .get("closeToTrayOnClose")
                .and_then(|value| value.as_bool()),
            Some(true)
        );
        assert_eq!(
            snapshot
                .get("lightweightModeOnCloseToTray")
                .and_then(|value| value.as_bool()),
            Some(true)
        );
        assert_eq!(
            snapshot
                .get("codexCliGuideDismissed")
                .and_then(|value| value.as_bool()),
            Some(true)
        );
        assert_eq!(
            snapshot.get("theme").and_then(|value| value.as_str()),
            Some("dark")
        );
        assert_eq!(
            snapshot
                .get("appearancePreset")
                .and_then(|value| value.as_str()),
            Some("classic")
        );
        assert_eq!(
            snapshot
                .get("serviceListenMode")
                .and_then(|value| value.as_str()),
            Some(boost_service::SERVICE_BIND_MODE_ALL_INTERFACES)
        );
        assert_eq!(
            snapshot
                .get("upstreamStreamTimeoutMs")
                .and_then(|value| value.as_u64()),
            Some(654321)
        );
        assert_eq!(
            snapshot
                .get("upstreamTotalTimeoutMs")
                .and_then(|value| value.as_u64()),
            Some(120000)
        );
        assert_eq!(
            snapshot
                .get("sseKeepaliveIntervalMs")
                .and_then(|value| value.as_u64()),
            Some(17000)
        );
        assert_eq!(
            snapshot
                .get("routeStrategy")
                .and_then(|value| value.as_str()),
            Some("balanced")
        );
        assert_eq!(
            snapshot
                .get("freeAccountMaxModel")
                .and_then(|value| value.as_str()),
            Some("gpt-5.3-codex")
        );
        assert_eq!(
            snapshot
                .get("modelForwardRules")
                .and_then(|value| value.as_str()),
            Some("spark*=gpt-5.4-mini")
        );
        assert_eq!(snapshot["quotaGuard"]["enabled"], true);
        assert_eq!(snapshot["quotaGuard"]["primaryMinRemainingPercent"], 7.0);
        assert_eq!(snapshot["quotaGuard"]["secondaryMinRemainingPercent"], 12.0);
        assert_eq!(snapshot["quotaGuard"]["allowAllLowQuotaFallback"], false);
        assert_eq!(
            snapshot
                .get("gatewayOriginator")
                .and_then(|value| value.as_str()),
            Some("codex_cli_rs_test")
        );
        assert_eq!(
            snapshot
                .get("gatewayOriginatorDefault")
                .and_then(|value| value.as_str()),
            Some("codex_cli_rs")
        );
        assert_eq!(
            snapshot
                .get("gatewayUserAgentVersion")
                .and_then(|value| value.as_str()),
            Some("0.101.2")
        );
        assert_eq!(
            snapshot
                .get("gatewayUserAgentVersionDefault")
                .and_then(|value| value.as_str()),
            Some(boost_service::default_gateway_user_agent_version())
        );
        assert_eq!(
            snapshot
                .get("gatewayResidencyRequirement")
                .and_then(|value| value.as_str()),
            Some("us")
        );
        assert_eq!(
            snapshot
                .get("webAccessPasswordConfigured")
                .and_then(|value| value.as_bool()),
            Some(true)
        );
        assert!(boost_service::verify_web_access_password(
            "secret-pass"
        ));

        let storage = Storage::open(db_path).expect("open storage");
        assert_eq!(
            storage
                .get_app_setting(
                    boost_service::APP_SETTING_LIGHTWEIGHT_MODE_ON_CLOSE_TO_TRAY_KEY
                )
                .expect("read lightweight close to tray"),
            Some("1".to_string())
        );
        assert_eq!(
            storage
                .get_app_setting(boost_service::APP_SETTING_UI_APPEARANCE_PRESET_KEY)
                .expect("read appearance preset"),
            Some("classic".to_string())
        );
        assert_eq!(
            storage
                .get_app_setting(boost_service::APP_SETTING_UI_CODEX_CLI_GUIDE_DISMISSED_KEY)
                .expect("read codex cli guide dismissed"),
            Some("1".to_string())
        );
        assert_eq!(
            storage
                .get_app_setting(
                    boost_service::APP_SETTING_GATEWAY_FREE_ACCOUNT_MAX_MODEL_KEY
                )
                .expect("read free account max model"),
            Some("gpt-5.3-codex".to_string())
        );
        assert_eq!(
            storage
                .get_app_setting(boost_service::APP_SETTING_GATEWAY_MODEL_FORWARD_RULES_KEY)
                .expect("read model forward rules"),
            Some("spark*=gpt-5.4-mini".to_string())
        );
        let stored_quota_guard = storage
            .get_app_setting(boost_service::APP_SETTING_GATEWAY_QUOTA_GUARD_KEY)
            .expect("read quota guard")
            .expect("quota guard stored");
        let stored_quota_guard: serde_json::Value =
            serde_json::from_str(&stored_quota_guard).expect("parse quota guard");
        assert_eq!(stored_quota_guard["primaryMinRemainingPercent"], 7.0);
        assert_eq!(stored_quota_guard["allowAllLowQuotaFallback"], false);
        assert_eq!(
            storage
                .get_app_setting(boost_service::APP_SETTING_GATEWAY_ORIGINATOR_KEY)
                .expect("read gateway originator"),
            Some("codex_cli_rs_test".to_string())
        );
        assert_eq!(
            storage
                .get_app_setting(boost_service::APP_SETTING_GATEWAY_USER_AGENT_VERSION_KEY)
                .expect("read gateway user agent version"),
            Some("0.101.2".to_string())
        );
        assert_eq!(
            storage
                .get_app_setting(
                    boost_service::APP_SETTING_GATEWAY_RESIDENCY_REQUIREMENT_KEY
                )
                .expect("read gateway residency requirement"),
            Some("us".to_string())
        );
        assert_eq!(
            storage
                .get_app_setting(
                    boost_service::APP_SETTING_GATEWAY_UPSTREAM_STREAM_TIMEOUT_MS_KEY
                )
                .expect("read upstream stream timeout"),
            Some("654321".to_string())
        );
        assert_eq!(
            storage
                .get_app_setting(
                    boost_service::APP_SETTING_GATEWAY_SSE_KEEPALIVE_INTERVAL_MS_KEY
                )
                .expect("read sse keepalive interval"),
            Some("17000".to_string())
        );
        let stored_password = storage
            .get_app_setting(boost_service::APP_SETTING_WEB_ACCESS_PASSWORD_HASH_KEY)
            .expect("read password hash");
        assert!(stored_password
            .as_deref()
            .is_some_and(|value| value.starts_with("sha256$")));
    });
}

/// 函数 `app_settings_set_preserves_dark_one_theme`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// 无
///
/// # 返回
/// 无
#[test]
fn app_settings_set_preserves_dark_one_theme() {
    with_temp_db(|_| {
        let snapshot = boost_service::app_settings_set(Some(&json!({
            "theme": "dark-one",
            "appearancePreset": "classic"
        })))
        .expect("save dark-one theme");

        assert_eq!(
            snapshot.get("theme").and_then(|value| value.as_str()),
            Some("dark-one")
        );

        let current = boost_service::app_settings_get().expect("get app settings");
        assert_eq!(
            current.get("theme").and_then(|value| value.as_str()),
            Some("dark-one")
        );
        assert_eq!(
            current
                .get("appearancePreset")
                .and_then(|value| value.as_str()),
            Some("classic")
        );
    });
}

#[test]
fn app_settings_set_preserves_model_forward_rules_case() {
    with_temp_db(|db_path| {
        let snapshot = boost_service::app_settings_set(Some(&json!({
            "modelForwardRules": "Spark*=GPT-5.4-mini\nClaude-Sonnet-4*=Gemini-2.5-Pro"
        })))
        .expect("save mixed-case model forward rules");

        assert_eq!(
            snapshot
                .get("modelForwardRules")
                .and_then(|value| value.as_str()),
            Some("Spark*=GPT-5.4-mini\nClaude-Sonnet-4*=Gemini-2.5-Pro")
        );

        let storage = Storage::open(db_path).expect("open storage");
        assert_eq!(
            storage
                .get_app_setting(boost_service::APP_SETTING_GATEWAY_MODEL_FORWARD_RULES_KEY)
                .expect("read model forward rules"),
            Some("Spark*=GPT-5.4-mini\nClaude-Sonnet-4*=Gemini-2.5-Pro".to_string())
        );
    });
}

#[test]
fn app_settings_get_defaults_codex_cli_guide_to_false() {
    with_temp_db(|db_path| {
        let storage = Storage::open(db_path).expect("open storage");
        storage
            .delete_app_setting(boost_service::APP_SETTING_UI_CODEX_CLI_GUIDE_DISMISSED_KEY)
            .expect("delete codex cli guide dismissed");
        drop(storage);

        let snapshot = boost_service::app_settings_get().expect("get app settings");

        assert_eq!(
            snapshot
                .get("codexCliGuideDismissed")
                .and_then(|value| value.as_bool()),
            Some(false)
        );
    });
}

/// 函数 `sync_runtime_settings_from_storage_applies_saved_runtime_values`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// 无
///
/// # 返回
/// 无
#[test]
fn sync_runtime_settings_from_storage_applies_saved_runtime_values() {
    with_temp_db(|db_path| {
        let storage = Storage::open(db_path).expect("open storage");
        storage
            .set_app_setting(
                boost_service::APP_SETTING_GATEWAY_ROUTE_STRATEGY_KEY,
                "balanced",
                now_ts(),
            )
            .expect("save route strategy");
        storage
            .set_app_setting(
                boost_service::APP_SETTING_GATEWAY_FREE_ACCOUNT_MAX_MODEL_KEY,
                "gpt-5.1-codex",
                now_ts(),
            )
            .expect("save free account max model");
        storage
            .set_app_setting(
                boost_service::APP_SETTING_GATEWAY_MODEL_FORWARD_RULES_KEY,
                "spark*=gpt-5.4-mini",
                now_ts(),
            )
            .expect("save model forward rules");
        storage
            .set_app_setting(
                boost_service::APP_SETTING_GATEWAY_REQUEST_COMPRESSION_ENABLED_KEY,
                "0",
                now_ts(),
            )
            .expect("save request compression enabled");
        storage
            .set_app_setting(
                boost_service::APP_SETTING_GATEWAY_ORIGINATOR_KEY,
                "codex_cli_rs_synced",
                now_ts(),
            )
            .expect("save gateway originator");
        storage
            .set_app_setting(
                boost_service::APP_SETTING_GATEWAY_USER_AGENT_VERSION_KEY,
                "0.101.3",
                now_ts(),
            )
            .expect("save gateway user agent version");
        storage
            .set_app_setting(
                boost_service::APP_SETTING_GATEWAY_RESIDENCY_REQUIREMENT_KEY,
                "us",
                now_ts(),
            )
            .expect("save gateway residency requirement");
        storage
            .set_app_setting(
                boost_service::APP_SETTING_GATEWAY_UPSTREAM_PROXY_URL_KEY,
                "http://127.0.0.1:8899",
                now_ts(),
            )
            .expect("save upstream proxy");
        storage
            .set_app_setting(
                boost_service::APP_SETTING_GATEWAY_UPSTREAM_STREAM_TIMEOUT_MS_KEY,
                "456789",
                now_ts(),
            )
            .expect("save upstream stream timeout");
        storage
            .set_app_setting(
                boost_service::APP_SETTING_GATEWAY_SSE_KEEPALIVE_INTERVAL_MS_KEY,
                "19000",
                now_ts(),
            )
            .expect("save sse keepalive interval");
        storage
            .set_app_setting(
                boost_service::APP_SETTING_GATEWAY_BACKGROUND_TASKS_KEY,
                &serde_json::to_string(&json!({
                    "usagePollingEnabled": false,
                    "usagePollIntervalSecs": 777,
                    "gatewayKeepaliveEnabled": true,
                    "gatewayKeepaliveIntervalSecs": 180,
                    "tokenRefreshPollingEnabled": true,
                    "tokenRefreshPollIntervalSecs": 60,
                    "usageRefreshWorkers": 4,
                    "httpWorkerFactor": 4,
                    "httpWorkerMin": 8,
                    "httpStreamWorkerFactor": 1,
                    "httpStreamWorkerMin": 2
                }))
                .expect("serialize background tasks"),
                now_ts(),
            )
            .expect("save background tasks");
        storage
            .set_app_setting(
                boost_service::APP_SETTING_ENV_OVERRIDES_KEY,
                &serde_json::to_string(&json!({
                    "BOOST_UPSTREAM_TOTAL_TIMEOUT_MS": "654321"
                }))
                .expect("serialize env overrides"),
                now_ts(),
            )
            .expect("save env overrides");
        drop(storage);
        let _env = override_env_vars(&[("BOOST_UPSTREAM_TOTAL_TIMEOUT_MS", None)]);

        boost_service::sync_runtime_settings_from_storage();

        let snapshot =
            boost_service::app_settings_get().expect("get app settings after sync");
        assert_eq!(
            snapshot
                .get("routeStrategy")
                .and_then(|value| value.as_str()),
            Some("balanced")
        );
        assert_eq!(
            snapshot
                .get("freeAccountMaxModel")
                .and_then(|value| value.as_str()),
            Some("gpt-5.1-codex")
        );
        assert_eq!(
            snapshot
                .get("modelForwardRules")
                .and_then(|value| value.as_str()),
            Some("spark*=gpt-5.4-mini")
        );
        assert_eq!(
            snapshot
                .get("gatewayOriginator")
                .and_then(|value| value.as_str()),
            Some("codex_cli_rs_synced")
        );
        assert_eq!(
            snapshot
                .get("gatewayOriginatorDefault")
                .and_then(|value| value.as_str()),
            Some("codex_cli_rs")
        );
        assert_eq!(
            snapshot
                .get("gatewayUserAgentVersion")
                .and_then(|value| value.as_str()),
            Some("0.101.3")
        );
        assert_eq!(
            snapshot
                .get("gatewayUserAgentVersionDefault")
                .and_then(|value| value.as_str()),
            Some(boost_service::default_gateway_user_agent_version())
        );
        assert_eq!(
            snapshot
                .get("gatewayResidencyRequirement")
                .and_then(|value| value.as_str()),
            Some("us")
        );
        assert_eq!(
            snapshot
                .get("upstreamProxyUrl")
                .and_then(|value| value.as_str()),
            Some("http://127.0.0.1:8899")
        );
        assert_eq!(
            snapshot
                .get("upstreamStreamTimeoutMs")
                .and_then(|value| value.as_u64()),
            Some(456789)
        );
        assert_eq!(
            snapshot
                .get("sseKeepaliveIntervalMs")
                .and_then(|value| value.as_u64()),
            Some(19000)
        );
        assert_eq!(
            snapshot
                .get("backgroundTasks")
                .and_then(|value| value.get("usagePollingEnabled"))
                .and_then(|value| value.as_bool()),
            Some(false)
        );
        assert_eq!(
            snapshot
                .get("backgroundTasks")
                .and_then(|value| value.get("usagePollIntervalSecs"))
                .and_then(|value| value.as_u64()),
            Some(777)
        );
        assert_eq!(
            snapshot
                .get("envOverrides")
                .and_then(|value| value.get("BOOST_UPSTREAM_TOTAL_TIMEOUT_MS"))
                .and_then(|value| value.as_str()),
            Some("654321")
        );
        assert_eq!(
            std::env::var("BOOST_UPSTREAM_TOTAL_TIMEOUT_MS")
                .ok()
                .as_deref(),
            Some("654321")
        );
    });
}

#[test]
fn sync_runtime_settings_from_storage_preserves_explicit_usage_workers_env() {
    with_temp_db(|db_path| {
        let storage = Storage::open(db_path).expect("open storage");
        storage
            .set_app_setting(
                boost_service::APP_SETTING_GATEWAY_BACKGROUND_TASKS_KEY,
                &serde_json::to_string(&json!({
                    "usagePollingEnabled": false,
                    "usagePollIntervalSecs": 777,
                    "gatewayKeepaliveEnabled": true,
                    "gatewayKeepaliveIntervalSecs": 180,
                    "tokenRefreshPollingEnabled": true,
                    "tokenRefreshPollIntervalSecs": 60,
                    "usageRefreshWorkers": 4,
                    "httpWorkerFactor": 4,
                    "httpWorkerMin": 8,
                    "httpStreamWorkerFactor": 1,
                    "httpStreamWorkerMin": 2
                }))
                .expect("serialize background tasks"),
                now_ts(),
            )
            .expect("save background tasks");
        drop(storage);

        let _env = override_env_vars(&[("BOOST_USAGE_REFRESH_WORKERS", Some("9"))]);

        boost_service::sync_runtime_settings_from_storage();

        let snapshot =
            boost_service::app_settings_get().expect("get app settings after sync");
        assert_eq!(
            snapshot
                .get("backgroundTasks")
                .and_then(|value| value.get("usageRefreshWorkers"))
                .and_then(|value| value.as_u64()),
            Some(9)
        );
    });
}

/// 函数 `app_settings_get_loads_env_backed_dedicated_settings_when_storage_missing`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// 无
///
/// # 返回
/// 无
#[test]
fn app_settings_get_loads_env_backed_dedicated_settings_when_storage_missing() {
    with_temp_db(|db_path| {
        let storage = Storage::open(db_path).expect("open storage");
        for key in [
            boost_service::APP_SETTING_SERVICE_ADDR_KEY,
            boost_service::SERVICE_BIND_MODE_SETTING_KEY,
            boost_service::APP_SETTING_GATEWAY_ROUTE_STRATEGY_KEY,
            boost_service::APP_SETTING_GATEWAY_FREE_ACCOUNT_MAX_MODEL_KEY,
            boost_service::APP_SETTING_GATEWAY_MODEL_FORWARD_RULES_KEY,
            boost_service::APP_SETTING_GATEWAY_ORIGINATOR_KEY,
            boost_service::APP_SETTING_GATEWAY_USER_AGENT_VERSION_KEY,
            boost_service::APP_SETTING_GATEWAY_RESIDENCY_REQUIREMENT_KEY,
            boost_service::APP_SETTING_GATEWAY_UPSTREAM_PROXY_URL_KEY,
            boost_service::APP_SETTING_GATEWAY_UPSTREAM_STREAM_TIMEOUT_MS_KEY,
            boost_service::APP_SETTING_GATEWAY_SSE_KEEPALIVE_INTERVAL_MS_KEY,
            boost_service::APP_SETTING_GATEWAY_BACKGROUND_TASKS_KEY,
        ] {
            storage.delete_app_setting(key).expect("delete app setting");
        }
        drop(storage);

        let _env = override_env_vars(&[
            ("BOOST_SERVICE_ADDR", Some("0.0.0.0:4999")),
            ("BOOST_ROUTE_STRATEGY", Some("balanced")),
            ("BOOST_FREE_ACCOUNT_MAX_MODEL", Some("gpt-5.2-codex")),
            (
                "BOOST_MODEL_FORWARD_RULES",
                Some("spark*=gpt-5.4-mini"),
            ),
            ("BOOST_ENABLE_REQUEST_COMPRESSION", Some("0")),
            ("BOOST_ORIGINATOR", Some("codex_cli_rs_env")),
            ("BOOST_RESIDENCY_REQUIREMENT", Some("us")),
            (
                "BOOST_UPSTREAM_PROXY_URL",
                Some("http://127.0.0.1:7899"),
            ),
            ("BOOST_UPSTREAM_STREAM_TIMEOUT_MS", Some("432100")),
            ("BOOST_SSE_KEEPALIVE_INTERVAL_MS", Some("14000")),
            ("BOOST_USAGE_POLLING_ENABLED", Some("0")),
            ("BOOST_USAGE_POLL_INTERVAL_SECS", Some("777")),
            ("BOOST_GATEWAY_KEEPALIVE_ENABLED", Some("0")),
            ("BOOST_GATEWAY_KEEPALIVE_INTERVAL_SECS", Some("240")),
            ("BOOST_TOKEN_REFRESH_POLLING_ENABLED", Some("0")),
            ("BOOST_TOKEN_REFRESH_POLL_INTERVAL_SECS", Some("120")),
            ("BOOST_USAGE_REFRESH_WORKERS", Some("6")),
            ("BOOST_HTTP_WORKER_FACTOR", Some("5")),
            ("BOOST_HTTP_WORKER_MIN", Some("9")),
            ("BOOST_HTTP_STREAM_WORKER_FACTOR", Some("2")),
            ("BOOST_HTTP_STREAM_WORKER_MIN", Some("3")),
        ]);

        let snapshot = boost_service::app_settings_get().expect("get app settings");

        assert_eq!(
            snapshot.get("serviceAddr").and_then(|value| value.as_str()),
            Some("localhost:4999")
        );
        assert_eq!(
            snapshot
                .get("serviceListenMode")
                .and_then(|value| value.as_str()),
            Some(boost_service::SERVICE_BIND_MODE_ALL_INTERFACES)
        );
        assert_eq!(
            snapshot
                .get("routeStrategy")
                .and_then(|value| value.as_str()),
            Some("balanced")
        );
        assert_eq!(
            snapshot
                .get("freeAccountMaxModel")
                .and_then(|value| value.as_str()),
            Some("gpt-5.2-codex")
        );
        assert_eq!(
            snapshot
                .get("modelForwardRules")
                .and_then(|value| value.as_str()),
            Some("spark*=gpt-5.4-mini")
        );
        assert_eq!(
            snapshot
                .get("gatewayOriginator")
                .and_then(|value| value.as_str()),
            Some("codex_cli_rs_env")
        );
        assert_eq!(
            snapshot
                .get("gatewayOriginatorDefault")
                .and_then(|value| value.as_str()),
            Some("codex_cli_rs")
        );
        assert_eq!(
            snapshot
                .get("gatewayUserAgentVersion")
                .and_then(|value| value.as_str()),
            Some(boost_service::default_gateway_user_agent_version())
        );
        assert_eq!(
            snapshot
                .get("gatewayUserAgentVersionDefault")
                .and_then(|value| value.as_str()),
            Some(boost_service::default_gateway_user_agent_version())
        );
        assert_eq!(
            snapshot
                .get("gatewayResidencyRequirement")
                .and_then(|value| value.as_str()),
            Some("us")
        );
        assert_eq!(
            snapshot
                .get("upstreamProxyUrl")
                .and_then(|value| value.as_str()),
            Some("http://127.0.0.1:7899")
        );
        assert_eq!(
            snapshot
                .get("upstreamStreamTimeoutMs")
                .and_then(|value| value.as_u64()),
            Some(432100)
        );
        assert_eq!(
            snapshot
                .get("sseKeepaliveIntervalMs")
                .and_then(|value| value.as_u64()),
            Some(14000)
        );
        assert_eq!(
            snapshot
                .get("backgroundTasks")
                .and_then(|value| value.get("usagePollingEnabled"))
                .and_then(|value| value.as_bool()),
            Some(false)
        );
        assert_eq!(
            snapshot
                .get("backgroundTasks")
                .and_then(|value| value.get("usagePollIntervalSecs"))
                .and_then(|value| value.as_u64()),
            Some(777)
        );
        assert_eq!(
            snapshot
                .get("backgroundTasks")
                .and_then(|value| value.get("gatewayKeepaliveEnabled"))
                .and_then(|value| value.as_bool()),
            Some(false)
        );
        assert_eq!(
            snapshot
                .get("backgroundTasks")
                .and_then(|value| value.get("tokenRefreshPollIntervalSecs"))
                .and_then(|value| value.as_u64()),
            Some(120)
        );

        let storage = Storage::open(db_path).expect("open storage");
        assert_eq!(
            storage
                .get_app_setting(boost_service::APP_SETTING_SERVICE_ADDR_KEY)
                .expect("read service addr"),
            Some("localhost:4999".to_string())
        );
        assert_eq!(
            storage
                .get_app_setting(boost_service::SERVICE_BIND_MODE_SETTING_KEY)
                .expect("read service bind mode"),
            Some(boost_service::SERVICE_BIND_MODE_ALL_INTERFACES.to_string())
        );
        assert_eq!(
            storage
                .get_app_setting(boost_service::APP_SETTING_GATEWAY_ROUTE_STRATEGY_KEY)
                .expect("read route strategy"),
            Some("balanced".to_string())
        );
        assert_eq!(
            storage
                .get_app_setting(
                    boost_service::APP_SETTING_GATEWAY_FREE_ACCOUNT_MAX_MODEL_KEY
                )
                .expect("read free account max model"),
            Some("gpt-5.2-codex".to_string())
        );
        assert_eq!(
            storage
                .get_app_setting(boost_service::APP_SETTING_GATEWAY_MODEL_FORWARD_RULES_KEY)
                .expect("read model forward rules"),
            Some("spark*=gpt-5.4-mini".to_string())
        );
        assert_eq!(
            storage
                .get_app_setting(boost_service::APP_SETTING_GATEWAY_ORIGINATOR_KEY)
                .expect("read gateway originator"),
            Some("codex_cli_rs_env".to_string())
        );
        assert_eq!(
            storage
                .get_app_setting(boost_service::APP_SETTING_GATEWAY_USER_AGENT_VERSION_KEY)
                .expect("read gateway user agent version"),
            Some(boost_service::default_gateway_user_agent_version().to_string())
        );
        assert_eq!(
            storage
                .get_app_setting(
                    boost_service::APP_SETTING_GATEWAY_RESIDENCY_REQUIREMENT_KEY
                )
                .expect("read gateway residency requirement"),
            Some("us".to_string())
        );
        assert_eq!(
            storage
                .get_app_setting(
                    boost_service::APP_SETTING_GATEWAY_UPSTREAM_STREAM_TIMEOUT_MS_KEY
                )
                .expect("read upstream stream timeout"),
            Some("432100".to_string())
        );
        assert_eq!(
            storage
                .get_app_setting(
                    boost_service::APP_SETTING_GATEWAY_SSE_KEEPALIVE_INTERVAL_MS_KEY
                )
                .expect("read sse keepalive interval"),
            Some("14000".to_string())
        );
    });
}

/// 函数 `loopback_service_addr_env_keeps_saved_bind_mode_effective`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// 无
///
/// # 返回
/// 无
#[test]
fn loopback_service_addr_env_keeps_saved_bind_mode_effective() {
    with_temp_db(|db_path| {
        let storage = Storage::open(db_path).expect("open storage");
        storage
            .set_app_setting(
                boost_service::SERVICE_BIND_MODE_SETTING_KEY,
                boost_service::SERVICE_BIND_MODE_ALL_INTERFACES,
                now_ts(),
            )
            .expect("save service bind mode");
        drop(storage);

        let _env = override_env_vars(&[("BOOST_SERVICE_ADDR", Some("localhost:49760"))]);

        let snapshot = boost_service::app_settings_get().expect("get app settings");

        assert_eq!(
            snapshot.get("serviceAddr").and_then(|value| value.as_str()),
            Some("localhost:49760")
        );
        assert_eq!(
            snapshot
                .get("serviceListenMode")
                .and_then(|value| value.as_str()),
            Some(boost_service::SERVICE_BIND_MODE_ALL_INTERFACES)
        );
        assert_eq!(
            boost_service::listener_bind_addr("localhost:49760"),
            "0.0.0.0:49760"
        );
        assert_eq!(
            std::env::var("BOOST_SERVICE_ADDR").ok().as_deref(),
            Some("0.0.0.0:49760")
        );
    });
}

/// 函数 `app_settings_set_service_listen_mode_overrides_loopback_env_snapshot`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// 无
///
/// # 返回
/// 无
#[test]
fn app_settings_set_service_listen_mode_overrides_loopback_env_snapshot() {
    with_temp_db(|_| {
        let _env = override_env_vars(&[("BOOST_SERVICE_ADDR", Some("localhost:49760"))]);

        let snapshot = boost_service::app_settings_set(Some(&json!({
            "serviceListenMode": "all_interfaces"
        })))
        .expect("save service listen mode");

        assert_eq!(
            snapshot.get("serviceAddr").and_then(|value| value.as_str()),
            Some("localhost:49760")
        );
        assert_eq!(
            snapshot
                .get("serviceListenMode")
                .and_then(|value| value.as_str()),
            Some(boost_service::SERVICE_BIND_MODE_ALL_INTERFACES)
        );

        let refreshed = boost_service::app_settings_get().expect("get app settings");
        assert_eq!(
            refreshed
                .get("serviceListenMode")
                .and_then(|value| value.as_str()),
            Some(boost_service::SERVICE_BIND_MODE_ALL_INTERFACES)
        );
        assert_eq!(
            boost_service::listener_bind_addr("localhost:49760"),
            "0.0.0.0:49760"
        );
    });
}

/// 函数 `app_settings_set_service_listen_mode_can_switch_back_from_all_interfaces_snapshot`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// 无
///
/// # 返回
/// 无
#[test]
fn app_settings_set_service_listen_mode_can_switch_back_from_all_interfaces_snapshot() {
    with_temp_db(|_| {
        let _env = override_env_vars(&[("BOOST_SERVICE_ADDR", Some("0.0.0.0:49760"))]);

        let snapshot = boost_service::app_settings_set(Some(&json!({
            "serviceListenMode": "loopback"
        })))
        .expect("save service listen mode");

        assert_eq!(
            snapshot.get("serviceAddr").and_then(|value| value.as_str()),
            Some("localhost:49760")
        );
        assert_eq!(
            snapshot
                .get("serviceListenMode")
                .and_then(|value| value.as_str()),
            Some(boost_service::SERVICE_BIND_MODE_LOOPBACK)
        );
        assert_eq!(
            std::env::var("BOOST_SERVICE_ADDR").ok().as_deref(),
            Some("localhost:49760")
        );
    });
}

/// 函数 `app_settings_set_persists_env_overrides_and_exposes_catalog`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// 无
///
/// # 返回
/// 无
#[test]
fn app_settings_set_persists_env_overrides_and_exposes_catalog() {
    with_temp_db(|db_path| {
        let snapshot = boost_service::app_settings_set(Some(&json!({
            "envOverrides": {
                "BOOST_UPSTREAM_TOTAL_TIMEOUT_MS": "321000",
                "BOOST_WEB_ROOT": "D:/tmp/web"
            }
        })))
        .expect("save env overrides");

        assert_eq!(
            snapshot
                .get("envOverrides")
                .and_then(|value| value.get("BOOST_UPSTREAM_TOTAL_TIMEOUT_MS"))
                .and_then(|value| value.as_str()),
            Some("321000")
        );
        assert_eq!(
            snapshot
                .get("envOverrides")
                .and_then(|value| value.get("BOOST_LOGIN_ADDR"))
                .and_then(|value| value.as_str()),
            Some("localhost:1455")
        );
        assert_eq!(
            std::env::var("BOOST_UPSTREAM_TOTAL_TIMEOUT_MS")
                .ok()
                .as_deref(),
            Some("321000")
        );
        let catalog = snapshot
            .get("envOverrideCatalog")
            .and_then(|value| value.as_array())
            .expect("catalog array");
        assert!(catalog.iter().all(|item| {
            item.get("key").and_then(|value| value.as_str())
                != Some("BOOST_UPSTREAM_STREAM_TIMEOUT_MS")
        }));
        let total_timeout = catalog
            .iter()
            .find(|item| {
                item.get("key").and_then(|value| value.as_str())
                    == Some("BOOST_UPSTREAM_TOTAL_TIMEOUT_MS")
            })
            .expect("catalog item");
        assert_eq!(
            total_timeout.get("label").and_then(|value| value.as_str()),
            Some("上游总超时（毫秒，0 为关闭）")
        );
        assert_eq!(
            total_timeout
                .get("defaultValue")
                .and_then(|value| value.as_str()),
            Some("0")
        );
        let image_generation_enabled = catalog
            .iter()
            .find(|item| {
                item.get("key").and_then(|value| value.as_str())
                    == Some("BOOST_CODEX_IMAGE_GENERATION_ENABLED")
            })
            .expect("image generation catalog item");
        assert_eq!(
            image_generation_enabled
                .get("label")
                .and_then(|value| value.as_str()),
            Some("Codex 图片生成兼容开关")
        );
        assert_eq!(
            image_generation_enabled
                .get("applyMode")
                .and_then(|value| value.as_str()),
            Some("runtime")
        );
        assert_eq!(
            image_generation_enabled
                .get("defaultValue")
                .and_then(|value| value.as_str()),
            Some("1")
        );
        let token_refresh_ahead = catalog
            .iter()
            .find(|item| {
                item.get("key").and_then(|value| value.as_str())
                    == Some("BOOST_TOKEN_REFRESH_AHEAD_SECS")
            })
            .expect("token refresh ahead catalog item");
        assert_eq!(
            token_refresh_ahead
                .get("defaultValue")
                .and_then(|value| value.as_str()),
            Some("3600")
        );
        assert_eq!(
            token_refresh_ahead
                .get("applyMode")
                .and_then(|value| value.as_str()),
            Some("runtime")
        );
        assert!(snapshot
            .get("envOverrideReservedKeys")
            .and_then(|value| value.as_array())
            .is_some_and(|items| items
                .iter()
                .any(|item| item.as_str() == Some("BOOST_WEB_ADDR"))));
        assert!(snapshot
            .get("envOverrideReservedKeys")
            .and_then(|value| value.as_array())
            .is_some_and(|items| items
                .iter()
                .any(|item| item.as_str() == Some("BOOST_ROUTE_STRATEGY"))));
        assert!(snapshot
            .get("envOverrideReservedKeys")
            .and_then(|value| value.as_array())
            .is_some_and(|items| items
                .iter()
                .any(|item| item.as_str() == Some("BOOST_UPSTREAM_STREAM_TIMEOUT_MS"))));

        let stored = read_env_overrides_map(db_path);
        assert_eq!(
            stored
                .get("BOOST_UPSTREAM_TOTAL_TIMEOUT_MS")
                .and_then(|value| value.as_str()),
            Some("321000")
        );
        assert_eq!(
            stored
                .get("BOOST_WEB_ROOT")
                .and_then(|value| value.as_str()),
            Some("D:/tmp/web")
        );
        assert_eq!(
            stored
                .get("BOOST_LOGIN_ADDR")
                .and_then(|value| value.as_str()),
            Some("localhost:1455")
        );
        assert!(!stored.contains_key("BOOST_UPSTREAM_STREAM_TIMEOUT_MS"));
        assert!(!stored.contains_key("BOOST_SSE_KEEPALIVE_INTERVAL_MS"));
    });
}

/// 函数 `app_settings_get_drops_web_addr_from_persisted_env_snapshot`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// 无
///
/// # 返回
/// 无
#[test]
fn app_settings_get_drops_web_addr_from_persisted_env_snapshot() {
    with_temp_db(|db_path| {
        let storage = Storage::open(db_path).expect("open storage");
        storage
            .set_app_setting(
                boost_service::APP_SETTING_ENV_OVERRIDES_KEY,
                &serde_json::to_string(&json!({
                    "BOOST_WEB_ADDR": "0.0.0.0:48761",
                    "BOOST_WEB_ROOT": "D:/tmp/web"
                }))
                .expect("serialize env overrides"),
                now_ts(),
            )
            .expect("save env overrides");
        drop(storage);

        let snapshot = boost_service::app_settings_get().expect("get app settings");

        assert!(snapshot
            .get("envOverrides")
            .and_then(|value| value.get("BOOST_WEB_ADDR"))
            .is_none());
        assert_eq!(
            snapshot
                .get("envOverrides")
                .and_then(|value| value.get("BOOST_WEB_ROOT"))
                .and_then(|value| value.as_str()),
            Some("D:/tmp/web")
        );

        let stored = read_env_overrides_map(db_path);
        assert!(!stored.contains_key("BOOST_WEB_ADDR"));
        assert_eq!(
            stored
                .get("BOOST_WEB_ROOT")
                .and_then(|value| value.as_str()),
            Some("D:/tmp/web")
        );
    });
}

/// 函数 `app_settings_get_seeds_full_env_override_snapshot`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// 无
///
/// # 返回
/// 无
#[test]
fn app_settings_get_seeds_full_env_override_snapshot() {
    with_temp_db(|db_path| {
        std::env::remove_var("BOOST_UPSTREAM_TOTAL_TIMEOUT_MS");
        std::env::remove_var("BOOST_WEB_ROOT");

        let snapshot = boost_service::app_settings_get().expect("get app settings");

        assert_eq!(
            snapshot
                .get("envOverrides")
                .and_then(|value| value.get("BOOST_UPSTREAM_TOTAL_TIMEOUT_MS"))
                .and_then(|value| value.as_str()),
            Some("0")
        );
        assert_eq!(
            snapshot
                .get("envOverrides")
                .and_then(|value| value.get("BOOST_WEB_ROOT"))
                .and_then(|value| value.as_str()),
            Some("")
        );
        assert!(snapshot
            .get("envOverrides")
            .and_then(|value| value.get("BOOST_UPSTREAM_STREAM_TIMEOUT_MS"))
            .is_none());
        assert!(snapshot
            .get("envOverrides")
            .and_then(|value| value.get("BOOST_SSE_KEEPALIVE_INTERVAL_MS"))
            .is_none());

        let stored = read_env_overrides_map(db_path);
        assert_eq!(
            stored
                .get("BOOST_UPSTREAM_TOTAL_TIMEOUT_MS")
                .and_then(|value| value.as_str()),
            Some("0")
        );
        assert_eq!(
            stored
                .get("BOOST_WEB_ROOT")
                .and_then(|value| value.as_str()),
            Some("")
        );
        assert!(!stored.contains_key("BOOST_UPSTREAM_STREAM_TIMEOUT_MS"));
        assert!(!stored.contains_key("BOOST_SSE_KEEPALIVE_INTERVAL_MS"));
    });
}

/// 函数 `app_settings_get_drops_reserved_env_overrides_from_persisted_snapshot`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// 无
///
/// # 返回
/// 无
#[test]
fn app_settings_get_drops_reserved_env_overrides_from_persisted_snapshot() {
    with_temp_db(|db_path| {
        let storage = Storage::open(db_path).expect("open storage");
        storage
            .set_app_setting(
                boost_service::APP_SETTING_GATEWAY_UPSTREAM_STREAM_TIMEOUT_MS_KEY,
                "456789",
                now_ts(),
            )
            .expect("save upstream stream timeout");
        storage
            .set_app_setting(
                boost_service::APP_SETTING_GATEWAY_SSE_KEEPALIVE_INTERVAL_MS_KEY,
                "19000",
                now_ts(),
            )
            .expect("save sse keepalive interval");
        storage
            .set_app_setting(
                boost_service::APP_SETTING_ENV_OVERRIDES_KEY,
                &serde_json::to_string(&json!({
                    "BOOST_UPSTREAM_STREAM_TIMEOUT_MS": "456789",
                    "BOOST_SSE_KEEPALIVE_INTERVAL_MS": "19000",
                    "BOOST_UPSTREAM_TOTAL_TIMEOUT_MS": "654321"
                }))
                .expect("serialize env overrides"),
                now_ts(),
            )
            .expect("save env overrides");
        drop(storage);
        let _env = override_env_vars(&[("BOOST_UPSTREAM_TOTAL_TIMEOUT_MS", None)]);

        let snapshot = boost_service::app_settings_get().expect("get app settings");

        assert_eq!(
            snapshot
                .get("upstreamStreamTimeoutMs")
                .and_then(|value| value.as_u64()),
            Some(456789)
        );
        assert_eq!(
            snapshot
                .get("sseKeepaliveIntervalMs")
                .and_then(|value| value.as_u64()),
            Some(19000)
        );
        assert_eq!(
            snapshot
                .get("envOverrides")
                .and_then(|value| value.get("BOOST_UPSTREAM_TOTAL_TIMEOUT_MS"))
                .and_then(|value| value.as_str()),
            Some("654321")
        );
        assert!(snapshot
            .get("envOverrides")
            .and_then(|value| value.get("BOOST_UPSTREAM_STREAM_TIMEOUT_MS"))
            .is_none());
        assert!(snapshot
            .get("envOverrides")
            .and_then(|value| value.get("BOOST_SSE_KEEPALIVE_INTERVAL_MS"))
            .is_none());

        let stored = read_env_overrides_map(db_path);
        assert_eq!(
            stored
                .get("BOOST_UPSTREAM_TOTAL_TIMEOUT_MS")
                .and_then(|value| value.as_str()),
            Some("654321")
        );
        assert!(!stored.contains_key("BOOST_UPSTREAM_STREAM_TIMEOUT_MS"));
        assert!(!stored.contains_key("BOOST_SSE_KEEPALIVE_INTERVAL_MS"));
    });
}

/// 函数 `app_settings_set_env_overrides_patch_preserves_other_values_and_reset_to_default`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// 无
///
/// # 返回
/// 无
#[test]
fn app_settings_set_env_overrides_patch_preserves_other_values_and_reset_to_default() {
    with_temp_db(|_| {
        let first = boost_service::app_settings_set(Some(&json!({
            "envOverrides": {
                "BOOST_UPSTREAM_TOTAL_TIMEOUT_MS": "321000",
                "BOOST_WEB_ROOT": "D:/tmp/web"
            }
        })))
        .expect("save first env overrides");
        assert_eq!(
            first
                .get("envOverrides")
                .and_then(|value| value.get("BOOST_WEB_ROOT"))
                .and_then(|value| value.as_str()),
            Some("D:/tmp/web")
        );

        let second = boost_service::app_settings_set(Some(&json!({
            "envOverrides": {
                "BOOST_UPSTREAM_TOTAL_TIMEOUT_MS": ""
            }
        })))
        .expect("reset timeout to default");

        assert_eq!(
            second
                .get("envOverrides")
                .and_then(|value| value.get("BOOST_UPSTREAM_TOTAL_TIMEOUT_MS"))
                .and_then(|value| value.as_str()),
            Some("0")
        );
        assert_eq!(
            second
                .get("envOverrides")
                .and_then(|value| value.get("BOOST_WEB_ROOT"))
                .and_then(|value| value.as_str()),
            Some("D:/tmp/web")
        );
        assert_eq!(
            std::env::var("BOOST_UPSTREAM_TOTAL_TIMEOUT_MS")
                .ok()
                .as_deref(),
            Some("0")
        );
        assert_eq!(
            std::env::var("BOOST_WEB_ROOT").ok().as_deref(),
            Some("D:/tmp/web")
        );
    });
}

/// 函数 `app_settings_set_rejects_reserved_and_bootstrap_env_override_keys`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// 无
///
/// # 返回
/// 无
#[test]
fn app_settings_set_rejects_reserved_and_bootstrap_env_override_keys() {
    with_temp_db(|_| {
        let reserved = boost_service::app_settings_set(Some(&json!({
            "envOverrides": {
                "BOOST_UPSTREAM_STREAM_TIMEOUT_MS": "123456"
            }
        })));
        assert!(reserved.is_err());

        let bootstrap = boost_service::app_settings_set(Some(&json!({
            "envOverrides": {
                "BOOST_DB_PATH": "D:/tmp/other.db"
            }
        })));
        assert!(bootstrap.is_err());
    });
}

#[test]
fn settings_do_not_publish_author_or_recommendation_metadata() {
    with_temp_db(|_| {
        let value=boost_service::app_settings_get().unwrap();
        assert!(value.get("authorSponsors").is_none());
        assert!(value.get("authorServerRecommendations").is_none());
    });
}

