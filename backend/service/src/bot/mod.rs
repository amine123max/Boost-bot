//! Managed, actor-scoped Boost Bot host. Model calls use ordinary owned gateway keys.
pub(crate) mod activity;
pub(crate) mod http;
pub(crate) mod model_sources;

use crate::RpcActor;
use rand::RngCore;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex, OnceLock, RwLock, Weak};
use std::time::Duration;

enum HostStartup {
    Migrating,
    Ready(Option<u16>),
    Failed(String),
}

fn wait_for_host(rx: std::sync::mpsc::Receiver<HostStartup>) -> Result<u16, String> {
    let started = std::time::Instant::now();
    let mut limit = Duration::from_secs(45);
    loop {
        let remaining = limit.checked_sub(started.elapsed()).ok_or("Boost Bot启动超时")?;
        match rx.recv_timeout(remaining).map_err(|_| "Boost Bot启动未完成")? {
            HostStartup::Migrating => limit = Duration::from_secs(600),
            HostStartup::Ready(port) => return port.filter(|port| *port > 0).ok_or_else(|| "Boost Bot启动端口无效".into()),
            HostStartup::Failed(error) => return Err(error),
        }
    }
}

struct Host {
    child: Child,
    port: u16,
    token: String,
    source_token: String,
}
#[derive(Clone)]
pub(crate) struct Endpoint {
    pub port: u16,
    pub token: String,
}
static HOSTS: OnceLock<Mutex<HashMap<String, Host>>> = OnceLock::new();
static SERVICE_ADDR: OnceLock<Mutex<String>> = OnceLock::new();
static RESOURCE_ROOT: OnceLock<PathBuf> = OnceLock::new();
static LIFECYCLE: OnceLock<RwLock<()>> = OnceLock::new();
static START_LOCKS: OnceLock<Mutex<HashMap<String, Weak<Mutex<()>>>>> = OnceLock::new();

fn start_lock(actor_scope: &str) -> Result<Arc<Mutex<()>>, String> {
    let mut locks = START_LOCKS
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .map_err(|_| "Boost Bot startup locks unavailable")?;
    if let Some(lock) = locks.get(actor_scope).and_then(Weak::upgrade) {
        return Ok(lock);
    }
    locks.retain(|_, lock| lock.strong_count() > 0);
    let lock = Arc::new(Mutex::new(()));
    locks.insert(actor_scope.to_string(), Arc::downgrade(&lock));
    Ok(lock)
}

pub fn configure_bot_runtime(root: PathBuf) {
    let _ = RESOURCE_ROOT.set(root);
}

pub(crate) fn set_service_addr(addr: &str) {
    *SERVICE_ADDR
        .get_or_init(|| Mutex::new(String::new()))
        .lock()
        .unwrap() = addr.to_string();
}

fn scope(actor: &RpcActor) -> Result<String, String> {
    if !actor.is_admin() && actor.user_id.is_none() {
        return Err("permission_denied: bot requires user session".into());
    }
    let identity = format!(
        "{}:{}",
        actor.role,
        actor.user_id.as_deref().unwrap_or("desktop")
    );
    Ok(format!("{:x}", Sha256::digest(identity.as_bytes())))
}

fn runtime_root() -> Result<PathBuf, String> {
    let mut candidates = Vec::new();
    if let Some(dir) = std::env::var_os("BOOST_BOT_ROOT") {
        candidates.push(PathBuf::from(dir));
    }
    if let Some(dir) = RESOURCE_ROOT.get() {
        candidates.push(dir.clone());
    }
    let exe = crate::process_env::exe_dir();
    candidates.extend([
        exe.join("boost-bot"),
        exe.join("resources/boost-bot"),
        exe.join("../Resources/boost-bot"),
    ]);
    candidates.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../bot"));
    candidates
        .into_iter()
        .find(|p| p.join("dist/backend/src/boost-host.js").is_file())
        .ok_or_else(|| "Boost Bot 运行时未准备：请运行 node scripts/prepare-boost-bot.mjs".into())
}

fn node_binary(root: &std::path::Path) -> PathBuf {
    if let Some(path) = std::env::var_os("BOOST_BOT_NODE") {
        return path.into();
    }
    let bundled = root
        .join("bin")
        .join(if cfg!(windows) { "node.exe" } else { "node" });
    if bundled.is_file() {
        bundled
    } else {
        PathBuf::from("node")
    }
}

fn gateway_base_url() -> Result<String, String> {
    let addr = SERVICE_ADDR
        .get_or_init(|| Mutex::new(String::new()))
        .lock()
        .unwrap()
        .clone();
    let mut url =
        url::Url::parse(&format!("http://{addr}/v1")).map_err(|_| "Boost 服务地址无效")?;
    let port = url.port().ok_or("Boost 服务端口缺失")?;
    // The host runs alongside the gateway; never send gateway credentials elsewhere.
    url.set_host(Some(if url.host_str().is_some_and(|s| s.contains(':')) {
        "[::1]"
    } else {
        "127.0.0.1"
    }))
    .map_err(|_| "Boost 服务地址无效")?;
    url.set_port(Some(port)).map_err(|_| "Boost 服务端口无效")?;
    Ok(url.to_string())
}

fn choose_existing_key<'a>(
    keys: &'a [boost_core::rpc::types::ApiKeySummary],
    remembered: Option<&str>,
) -> Result<&'a boost_core::rpc::types::ApiKeySummary, String> {
    if let Some(key) = remembered.and_then(|id| keys.iter().find(|key| key.id == id)) {
        if key.status != "active" {
            return Err("Boost Bot 使用的密钥已禁用，请在密钥页启用已有密钥".into());
        }
        if key.protocol_type != "openai_compat" {
            return Err("Boost Bot 需要已有的 OpenAI 兼容密钥".into());
        }
        return Ok(key);
    }
    keys.iter()
        .filter(|key| key.status == "active" && key.protocol_type == "openai_compat")
        .min_by_key(|key| {
            (
                key.name
                    .as_deref()
                    .is_some_and(|name| name.starts_with("Boost Bot")),
                key.model_slug.is_some(),
            )
        })
        .ok_or_else(|| "当前账号没有可用的 OpenAI 兼容密钥，请先启用已有密钥".into())
}

fn gateway_key(actor: &RpcActor, scope: &str) -> Result<String, String> {
    let storage = crate::storage_helpers::open_storage().ok_or("storage unavailable")?;
    let setting = format!("bot.gateway_key.v1.{scope}");
    let remembered = storage
        .get_app_setting(&setting)
        .map_err(|e| e.to_string())?;
    let owners = storage.list_api_key_owners().map_err(|e| e.to_string())?;
    let keys = crate::apikey_list::read_api_keys_for_actor(actor)?
        .into_iter()
        .filter(|key| {
            let owner = owners.get(&key.id);
            match owner {
                Some(owner) if owner.owner_kind == "user" => {
                    owner.owner_user_id.as_deref() == actor.user_id.as_deref()
                }
                _ => actor.is_admin(),
            }
        })
        .collect::<Vec<_>>();
    if let Some(id) = remembered.as_deref() {
        if !keys.iter().any(|key| key.id == id)
            && storage
                .find_api_key_by_id(id)
                .map_err(|e| e.to_string())?
                .is_some()
        {
            return Err("permission_denied: Boost Bot key ownership changed".into());
        }
    }
    let key = choose_existing_key(&keys, remembered.as_deref())?;
    let secret = crate::apikey_read_secret::read_api_key_secret(&key.id)?.key;
    if remembered.as_deref() != Some(key.id.as_str()) {
        storage
            .set_app_setting(&setting, &key.id, boost_core::storage::now_ts())
            .map_err(|e| e.to_string())?;
    }
    Ok(secret)
}

pub(crate) fn ensure_host(actor: &RpcActor) -> Result<Endpoint, String> {
    // Cold-starting one user's runtime must not stall every other user's API.
    // Shutdown waits for admitted starts before draining the process map.
    let _lifecycle = LIFECYCLE.get_or_init(|| RwLock::new(())).read()
        .map_err(|_| "Boost Bot lifecycle unavailable")?;
    let actor_scope = scope(actor)?;
    let actor_start = start_lock(&actor_scope)?;
    let _actor_start = actor_start.lock().map_err(|_| "Boost Bot startup unavailable")?;
    let mut hosts = HOSTS
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .map_err(|_| "Boost Bot host lock unavailable")?;
    if let Some(host) = hosts.get_mut(&actor_scope) {
        if host.child.try_wait().map_err(|e| e.to_string())?.is_none() {
            return Ok(Endpoint {
                port: host.port,
                token: host.token.clone(),
            });
        }
    }
    if let Some(host)=hosts.remove(&actor_scope) { model_sources::revoke(&host.source_token); }
    drop(hosts);
    let root = runtime_root()?;
    let base_url = gateway_base_url()?;
    let key = gateway_key(actor, &actor_scope)?;
    let mut source_lease = model_sources::Lease::new(actor)?;
    let data_dir = crate::process_env::db_dir().join("bots").join(&actor_scope);
    let scratch = std::env::var_os("TMPDIR")
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .map(|path| path.join(format!("boost-bot-{}", &actor_scope[..12])))
        .unwrap_or_else(|| data_dir.join("tmp/runtime"));
    std::fs::create_dir_all(&scratch).map_err(|e| e.to_string())?;
    let mut random = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut random);
    let token = random
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect::<String>();
    let mut command = Command::new(node_binary(&root));
    command
        .arg(root.join("dist/backend/src/boost-host.js"))
        .current_dir(&root)
        .env("TEMP", &scratch)
        .env("TMP", &scratch)
        .env("TMPDIR", &scratch)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    let mut child = command
        .spawn()
        .map_err(|e| format!("启动 Boost Bot 失败（需要 Node.js 22.13+）：{e}"))?;
    let payload = json!({ "dataDir": data_dir, "token": token, "baseUrl": base_url,
        "apiKey": key, "allowTools": actor.is_admin(), "parentPid": std::process::id(),
        "sourceBroker": {"url":format!("{}/_boost/bot/model-sources",base_url.trim_end_matches("/v1")),"token":source_lease.token} });
    if let Err(error) = writeln!(
        child.stdin.as_mut().ok_or("Boost Bot stdin unavailable")?,
        "{payload}"
    ) {
        let _ = child.kill();
        let _ = child.wait();
        return Err(error.to_string());
    }
    let stdout = child.stdout.take().ok_or("Boost Bot stdout unavailable")?;
    let (tx, rx) = std::sync::mpsc::sync_channel(1);
    std::thread::spawn(move || {
        // Keep draining stdout after readiness so logs cannot fill a pipe.
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if let Ok(value) = serde_json::from_str::<Value>(&line) {
                if value.get("boostBotMigration").and_then(Value::as_bool) == Some(true) {
                    let _ = tx.try_send(HostStartup::Migrating);
                }
                if let Some(error) = value.get("boostBotError").and_then(Value::as_str) {
                    let _ = tx.send(HostStartup::Failed(error.chars().take(1000).collect()));
                }
                if value.get("boostBotReady").and_then(Value::as_bool) == Some(true) {
                    let _ = tx.send(HostStartup::Ready(
                        value
                            .get("port")
                            .and_then(Value::as_u64)
                            .and_then(|p| u16::try_from(p).ok()),
                    ));
                }
            }
        }
    });
    let port = match wait_for_host(rx) {
        Ok(port) => port,
        Err(error) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(format!(
                "{error}，请查看 {}",
                data_dir.join("logs/app.log").display()
            ));
        }
    };
    let mut hosts = HOSTS.get().ok_or("Boost Bot hosts unavailable")?.lock()
        .map_err(|_| "Boost Bot host lock unavailable")?;
    hosts.insert(
        actor_scope,
        Host {
            child,
            port,
            token: token.clone(),
            source_token: source_lease.token.clone(),
        },
    );
    source_lease.retain();
    Ok(Endpoint { port, token })
}

pub(crate) fn open(actor: &RpcActor, desktop: bool) -> Result<Value, String> {
    if desktop && !actor.is_admin() {
        return Err("permission_denied: desktop bot".into());
    }
    let endpoint = ensure_host(actor)?;
    Ok(json!({ "url": if desktop {
        format!("http://127.0.0.1:{}/boost-bot/?token={}", endpoint.port, endpoint.token)
    } else { "/boost-bot/".into() }, "toolsAllowed": actor.is_admin() }))
}

pub(crate) fn shutdown() {
    let Ok(_lifecycle) = LIFECYCLE.get_or_init(|| RwLock::new(())).write() else { return; };
    let Some(hosts) = HOSTS.get() else {
        return;
    };
    if let Ok(mut hosts) = hosts.lock() {
        let children = hosts.drain().map(|(_, host)| host).collect::<Vec<_>>();
        drop(hosts);
        for mut host in children {
            model_sources::revoke(&host.source_token);
            if let Some(stdin) = host.child.stdin.as_mut() {
                let _ = writeln!(stdin, "shutdown");
            }
            std::thread::spawn(move || {
                for _ in 0..40 {
                    if host.child.try_wait().ok().flatten().is_some() {
                        return;
                    }
                    std::thread::sleep(Duration::from_millis(200));
                }
                let _ = host.child.kill();
                let _ = host.child.wait();
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn migration_notice_keeps_waiting_for_readiness_and_rejects_invalid_ports() {
        let (tx, rx) = std::sync::mpsc::channel();
        tx.send(HostStartup::Migrating).unwrap();
        tx.send(HostStartup::Ready(Some(12345))).unwrap();
        assert_eq!(wait_for_host(rx), Ok(12345));
        let (tx, rx) = std::sync::mpsc::channel();
        tx.send(HostStartup::Ready(Some(0))).unwrap();
        assert!(wait_for_host(rx).is_err());
        let (tx, rx) = std::sync::mpsc::channel();
        drop(tx);
        assert!(wait_for_host(rx).is_err());
        let (tx, rx) = std::sync::mpsc::channel();
        tx.send(HostStartup::Failed("目标目录冲突".into())).unwrap();
        assert_eq!(wait_for_host(rx), Err("目标目录冲突".into()));
    }
    #[test]
    fn actor_startup_locks_deduplicate_one_actor_without_blocking_another() {
        let a = start_lock("startup-test-alice").unwrap();
        let same = start_lock("startup-test-alice").unwrap();
        let b = start_lock("startup-test-bob").unwrap();
        assert!(Arc::ptr_eq(&a, &same));
        assert!(!Arc::ptr_eq(&a, &b));
        let _held = a.lock().unwrap();
        assert!(same.try_lock().is_err());
        assert!(b.try_lock().is_ok());
    }
    #[test]
    fn selects_existing_keys_without_provisioning_and_preserves_disabled_keys() {
        let key = |id: &str, status: &str, protocol: &str| {
            serde_json::from_value::<boost_core::rpc::types::ApiKeySummary>(json!({
            "id":id,"status":status,"protocolType":protocol,"rotationStrategy":"account_rotation",
            "clientType":"codex","authScheme":"authorization_bearer","createdAt":0
        })).unwrap()
        };
        let keys = vec![
            key("disabled", "disabled", "openai_compat"),
            key("native", "active", "anthropic_native"),
            key("existing", "active", "openai_compat"),
        ];
        assert_eq!(choose_existing_key(&keys, None).unwrap().id, "existing");
        assert_eq!(
            choose_existing_key(&keys, Some("removed")).unwrap().id,
            "existing"
        );
        assert!(choose_existing_key(&keys, Some("disabled"))
            .unwrap_err()
            .contains("禁用"));
        assert!(choose_existing_key(&[], None).is_err());
    }
    #[test]
    fn bot_scopes_are_safe_distinct_and_require_member_identity() {
        let admin = scope(&RpcActor::system_admin()).unwrap();
        let a = scope(&RpcActor::from_parts(Some("member"), Some("../alice"))).unwrap();
        let b = scope(&RpcActor::from_parts(Some("member"), Some("bob"))).unwrap();
        assert!(scope(&RpcActor::from_parts(Some("member"), None)).is_err());
        assert_ne!(admin, a);
        assert_ne!(a, b);
        assert_eq!(a.len(), 64);
        assert!(a.chars().all(|c| c.is_ascii_hexdigit()));
    }
}
