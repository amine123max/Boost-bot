use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::sync::{OnceLock, RwLock};

const KEY: &str = "gateway.proxy_control.v1";
thread_local! { static ACCOUNT: std::cell::RefCell<Option<String>> = const { std::cell::RefCell::new(None) }; }
pub(crate) struct AccountScope(Option<String>, std::marker::PhantomData<std::rc::Rc<()>>);
impl Drop for AccountScope {
    fn drop(&mut self) {
        ACCOUNT.with(|value| *value.borrow_mut() = self.0.take());
    }
}
pub(crate) fn account_scope(id: &str) -> AccountScope {
    AccountScope(
        ACCOUNT.with(|value| value.replace(Some(id.into()))),
        std::marker::PhantomData,
    )
}
pub(crate) fn current_account() -> Option<String> {
    ACCOUNT.with(|value| value.borrow().clone())
}

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub(crate) struct Policy {
    #[serde(default = "default_strategy")]
    pub strategy: String,
    pub selected_id: String,
    pub bindings: BTreeMap<String, String>,
    pub auto_update: bool,
    pub managed_core: String,
}
fn default_strategy() -> String {
    "stable".into()
}
fn cell() -> &'static RwLock<Policy> {
    static CELL: OnceLock<RwLock<Policy>> = OnceLock::new();
    CELL.get_or_init(|| {
        RwLock::new(Policy {
            strategy: default_strategy(),
            ..Policy::default()
        })
    })
}
pub(crate) fn current() -> Policy {
    cell().read().unwrap_or_else(|e| e.into_inner()).clone()
}
pub(crate) fn load() {
    if let Some(storage) = crate::storage_helpers::open_storage() {
        if let Ok(Some(raw)) = storage.get_app_setting(KEY) {
            if let Ok(policy) = serde_json::from_str::<Policy>(&raw) {
                if matches!(policy.strategy.as_str(), "stable" | "latency" | "manual") {
                    *cell().write().unwrap_or_else(|e| e.into_inner()) = policy;
                }
            }
        }
    }
}
pub(crate) fn save(policy: Policy) -> Result<(), String> {
    if !matches!(policy.strategy.as_str(), "stable" | "latency" | "manual") {
        return Err("选择策略无效".into());
    }
    let storage = crate::storage_helpers::open_storage().ok_or("无法读取代理配置存储")?;
    storage
        .set_app_setting(
            KEY,
            &serde_json::to_string(&policy).map_err(|_| "代理策略序列化失败")?,
            boost_core::storage::now_ts(),
        )
        .map_err(|_| "保存代理策略失败")?;
    *cell().write().unwrap_or_else(|e| e.into_inner()) = policy;
    Ok(())
}

/// Labels are import metadata, not claims about a measured exit location.
pub(crate) fn label_country(name: &str) -> (&'static str, &'static str) {
    let lower = name.to_lowercase();
    for (terms, code, country) in [
        (&["日本", "japan", "🇯🇵"][..], "JP", "日本"),
        (&["美国", "united states", "🇺🇸"][..], "US", "美国"),
        (&["香港", "hong kong", "🇭🇰"][..], "HK", "中国香港"),
        (&["台湾", "taiwan", "🇹🇼"][..], "TW", "中国台湾"),
        (&["新加坡", "singapore", "🇸🇬"][..], "SG", "新加坡"),
        (&["韩国", "korea", "🇰🇷"][..], "KR", "韩国"),
        (&["英国", "united kingdom", "🇬🇧"][..], "GB", "英国"),
        (&["德国", "germany", "🇩🇪"][..], "DE", "德国"),
        (&["法国", "france", "🇫🇷"][..], "FR", "法国"),
        (&["加拿大", "canada", "🇨🇦"][..], "CA", "加拿大"),
        (&["澳大利亚", "australia", "🇦🇺"][..], "AU", "澳大利亚"),
        (&["荷兰", "netherlands", "🇳🇱"][..], "NL", "荷兰"),
    ] {
        if terms.iter().any(|t| lower.contains(t)) {
            return (code, country);
        }
    }
    ("", "地区待检测")
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn policy_persists_stable_bindings_and_removed_nodes_block_traffic() {
        let _guard = crate::test_env_guard();
        struct Restore {
            policy: Policy,
            db: Option<std::ffi::OsString>,
        }
        impl Drop for Restore {
            fn drop(&mut self) {
                *cell().write().unwrap_or_else(|e| e.into_inner()) = self.policy.clone();
                if let Some(value) = &self.db {
                    std::env::set_var("BOOST_DB_PATH", value);
                } else {
                    std::env::remove_var("BOOST_DB_PATH");
                }
            }
        }
        let _restore = Restore {
            policy: current(),
            db: std::env::var_os("BOOST_DB_PATH"),
        };
        let directory = std::env::temp_dir().join(format!("proxy-policy-{}", std::process::id()));
        std::fs::create_dir_all(&directory).unwrap();
        std::env::set_var("BOOST_DB_PATH", directory.join("policy.db"));
        crate::initialize_storage_if_needed().unwrap();
        let mut policy = current();
        policy.strategy = "latency".into();
        policy.auto_update = false;
        policy
            .bindings
            .insert("account-pinned".into(), "deleted-node".into());
        save(policy).unwrap();
        *cell().write().unwrap_or_else(|e| e.into_inner()) = Policy {
            strategy: default_strategy(),
            ..Policy::default()
        };
        load();
        assert_eq!(current().strategy, "latency");
        assert_eq!(current().bindings["account-pinned"], "deleted-node");
        assert_eq!(
            crate::upstream_proxy::endpoint_for_account("account-pinned").as_deref(),
            Some("http://127.0.0.1:0")
        );
        assert_eq!(
            crate::upstream_proxy::endpoint_for_account("unbound-account"),
            None
        );
    }
    #[test]
    fn account_scopes_restore_and_are_isolated_between_threads() {
        assert_eq!(current_account(), None);
        let scope = account_scope("account-a");
        assert_eq!(current_account().as_deref(), Some("account-a"));
        {
            let _nested = account_scope("account-b");
            assert_eq!(current_account().as_deref(), Some("account-b"));
        }
        assert_eq!(current_account().as_deref(), Some("account-a"));
        std::thread::spawn(|| assert_eq!(current_account(), None))
            .join()
            .unwrap();
        drop(scope);
        assert_eq!(current_account(), None);
    }
}
