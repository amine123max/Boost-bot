//! Multiline upstream nodes share one authenticated local proxy. sing-box owns
//! health checks and selection, so gateway, refresh, usage and WebSocket traffic
//! use the same route without ever falling back to a direct outbound.
use rand::{distributions::Alphanumeric, Rng};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::Write;
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

const MAX_NODES: usize = 32;
const BLOCKED_PROXY: &str = "http://127.0.0.1:0";

#[derive(Clone)]
struct Node {
    id: String,
    url: String,
    name: String,
    outbound: Value,
    native: bool,
}

struct Core {
    child: Child,
    config: Value,
    endpoint: String,
    controller: SocketAddr,
    secret: String,
    node_endpoints: HashMap<String, String>,
}

impl Drop for Core {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[derive(Default)]
struct State {
    raw: Option<String>,
    endpoint: Option<String>,
    nodes: Vec<Node>,
    core: Option<Core>,
    error: Option<String>,
    selection: (String, String),
}

fn state() -> &'static Mutex<State> {
    static STATE: OnceLock<Mutex<State>> = OnceLock::new();
    STATE.get_or_init(|| Mutex::new(State::default()))
}

fn decode(value: &str) -> Result<String, String> {
    urlencoding::decode(value)
        .map(|value| value.into_owned())
        .map_err(|_| "节点包含无效的 URL 编码".to_string())
}

fn parse_node(raw: &str, index: usize) -> Result<Node, String> {
    let expanded;
    let raw = if !raw.contains("://") {
        let (authority, label) = raw
            .split_once('#')
            .map(|(a, b)| (a, Some(b)))
            .unwrap_or((raw, None));
        let address = if authority.bytes().all(|c| c.is_ascii_digit()) {
            format!("127.0.0.1:{authority}")
        } else {
            authority.to_string()
        };
        let url =
            url::Url::parse(&format!("http://{address}")).map_err(|_| "本地代理地址格式无效")?;
        let host = url
            .host_str()
            .unwrap_or("")
            .trim_start_matches('[')
            .trim_end_matches(']');
        if !(host.eq_ignore_ascii_case("localhost")
            || host
                .parse::<std::net::IpAddr>()
                .is_ok_and(|ip| ip.is_loopback()))
            || (url.port().is_none() && !address.ends_with(":80"))
        {
            return Err("请填写本地端口、127.0.0.1:端口，或完整代理链接".into());
        }
        expanded = format!(
            "http://{address}{}",
            label.map(|v| format!("#{v}")).unwrap_or_default()
        );
        expanded.as_str()
    } else {
        raw
    };
    if !raw.contains("://") || raw.len() > 8192 {
        return Err("节点地址格式无效或过长".into());
    }
    let mut text = raw.to_string();
    if text.starts_with("socks://") {
        text = text.replacen("socks://", "socks5h://", 1);
    } else if text.starts_with("socks5://") {
        text = text.replacen("socks5://", "socks5h://", 1);
    }
    let url = url::Url::parse(&text).map_err(|_| "节点地址格式无效".to_string())?;
    let scheme = url.scheme();
    if !matches!(scheme, "http" | "https" | "socks5h" | "trojan" | "anytls") {
        return Err("支持 HTTP、HTTPS、SOCKS5、Trojan 和 AnyTLS 节点".into());
    }
    let host = url
        .host_str()
        .filter(|h| !h.is_empty())
        .ok_or("节点缺少服务器地址")?;
    let host = host.trim_start_matches('[').trim_end_matches(']');
    let port = url
        .port_or_known_default()
        .or_else(|| match scheme {
            "socks5h" => Some(1080),
            "trojan" | "anytls" => Some(443),
            _ => None,
        })
        .ok_or("节点缺少端口")?;
    if port == 0 || !matches!(url.path(), "" | "/") {
        return Err("节点端口或路径无效".into());
    }
    let native = matches!(scheme, "trojan" | "anytls");
    let mut outbound = json!({
        "type": match scheme { "https" => "http", "socks5h" => "socks", other => other },
        "tag": format!("node-{index}"), "server": host, "server_port": port,
    });
    if scheme == "socks5h" {
        outbound["version"] = json!("5");
    }
    let username = decode(url.username())?;
    let password = decode(url.password().unwrap_or_default())?;
    let params: std::collections::HashMap<_, _> = url.query_pairs().into_owned().collect();
    if native {
        if username.is_empty() || url.password().is_some() {
            return Err("Trojan / AnyTLS 链接应使用 protocol://password@host:port 格式".into());
        }
        for (key, value) in &params {
            match key.as_str() {
                "security" if value == "tls" => {}
                "type" if value == "tcp" => {}
                "headerType" if value == "none" => {}
                "sni" | "fp" | "alpn" => {}
                "allowInsecure" | "insecure"
                    if matches!(value.as_str(), "0" | "1" | "true" | "false") => {}
                _ => return Err(format!("节点参数 {key} 不受支持，请使用 TCP + TLS 链接")),
            }
        }
        outbound["password"] = json!(username);
    } else {
        if !params.is_empty() {
            return Err("HTTP / SOCKS5 代理地址不支持查询参数".into());
        }
        if !username.is_empty() {
            outbound["username"] = json!(username);
            outbound["password"] = json!(password);
        }
    }
    if native || scheme == "https" {
        let insecure = ["insecure", "allowInsecure"]
            .iter()
            .any(|key| params.get(*key).is_some_and(|v| v == "1" || v == "true"));
        let mut tls = json!({"enabled": true, "server_name": params.get("sni").map(String::as_str).filter(|v| !v.is_empty()).unwrap_or(host), "insecure": insecure});
        if let Some(fp) = params.get("fp").filter(|v| !v.is_empty()) {
            tls["utls"] = json!({"enabled": true, "fingerprint": fp});
        }
        if let Some(alpn) = params.get("alpn").filter(|v| !v.is_empty()) {
            tls["alpn"] = json!(alpn.split(',').collect::<Vec<_>>());
        }
        outbound["tls"] = tls;
    }
    let name = url
        .fragment()
        .map(decode)
        .transpose()?
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| format!("{scheme} · {host}:{port}"));
    // Display labels never contain userinfo, even for a credential-like fragment.
    let name = if name.contains("://") || name.contains('@') {
        format!("节点 {}", index + 1)
    } else {
        name
    };
    Ok(Node {
        id: format!(
            "{:x}",
            Sha256::digest(text.split('#').next().unwrap_or(&text).as_bytes())
        )[..24]
            .to_string(),
        url: text,
        name,
        outbound,
        native,
    })
}

fn parse(raw: Option<&str>) -> Result<Vec<Node>, String> {
    let mut nodes: Vec<Node> = Vec::new();
    for line in raw
        .unwrap_or_default()
        .lines()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        if nodes.len() >= MAX_NODES {
            return Err(format!("最多支持 {MAX_NODES} 个代理节点"));
        }
        let node = parse_node(line, nodes.len())
            .map_err(|err| format!("第 {} 个节点：{err}", nodes.len() + 1))?;
        if !nodes.iter().any(|old| old.id == node.id) {
            nodes.push(node);
        }
    }
    Ok(nodes)
}

pub(crate) fn normalize(raw: Option<&str>) -> Result<Option<String>, String> {
    let nodes = parse(raw)?;
    Ok((!nodes.is_empty()).then(|| {
        nodes
            .iter()
            .map(|n| n.url.as_str())
            .collect::<Vec<_>>()
            .join("\n")
    }))
}

fn core_path() -> PathBuf {
    crate::proxy_kernel::executable()
}

fn random_secret() -> String {
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(40)
        .map(char::from)
        .collect()
}

fn config(nodes: &[Node], proxy_port: u16, controller: SocketAddr, secret: &str) -> Value {
    let policy = crate::proxy_policy::current();
    let mut outbounds: Vec<_> = nodes.iter().map(|n| n.outbound.clone()).collect();
    outbounds.push(json!({
        "type": "urltest", "tag": "auto", "outbounds": (0..nodes.len()).map(|i| format!("node-{i}")).collect::<Vec<_>>(),
        "url": "https://www.gstatic.com/generate_204", "interval": "1m", "tolerance": if policy.strategy == "latency" { 1 } else { 200 },
        "interrupt_exist_connections": false,
    }));
    let selected = nodes
        .iter()
        .position(|n| n.id == policy.selected_id)
        .map(|i| format!("node-{i}"));
    let mut options = vec!["auto".to_string()];
    options.extend((0..nodes.len()).map(|i| format!("node-{i}")));
    outbounds.push(json!({"type": "selector", "tag": "selected", "outbounds": options,
        "default": if policy.strategy == "manual" { selected.as_deref().unwrap_or("auto") } else { "auto" }, "interrupt_exist_connections": false}));
    json!({
        "log": {"disabled": true},
        "inbounds": [{"type": "mixed", "tag": "boost", "listen": "127.0.0.1", "listen_port": proxy_port,
            "users": [{"username": "boost", "password": secret}]}],
        "outbounds": outbounds, "route": {"final": "selected"},
        "experimental": {"clash_api": {"external_controller": controller.to_string(), "secret": secret}},
    })
}

fn spawn_core(config: &Value) -> Result<Child, String> {
    let mut command = Command::new(core_path());
    command
        .args(["run", "-c", "stdin"])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    let mut child = command.spawn().map_err(|_| "未能启动 sing-box；请在服务端安装 sing-box 1.12+（含 Clash API 和 uTLS），放在 Boost 可执行文件同目录或 PATH 中".to_string())?;
    let result = child
        .stdin
        .take()
        .ok_or_else(|| "无法写入代理内核配置".to_string())
        .and_then(|mut stdin| {
            serde_json::to_writer(&mut stdin, config)
                .map_err(|_| "无法写入代理内核配置".to_string())?;
            stdin
                .flush()
                .map_err(|_| "无法写入代理内核配置".to_string())
        });
    if let Err(error) = result {
        let _ = child.kill();
        let _ = child.wait();
        return Err(error);
    }
    Ok(child)
}

fn start(nodes: &[Node]) -> Result<Core, String> {
    start_with(nodes, |_| {})
}

fn start_with(nodes: &[Node], customize: impl FnOnce(&mut Value)) -> Result<Core, String> {
    // Reserve both ports until immediately before spawn, then verify readiness.
    let proxy = TcpListener::bind("127.0.0.1:0").map_err(|_| "无法分配本地代理端口")?;
    let controller = TcpListener::bind("127.0.0.1:0").map_err(|_| "无法分配代理控制端口")?;
    let proxy_addr = proxy.local_addr().map_err(|_| "无法读取本地代理端口")?;
    let controller_addr = controller
        .local_addr()
        .map_err(|_| "无法读取代理控制端口")?;
    let secret = random_secret();
    let mut config = config(nodes, proxy_addr.port(), controller_addr, &secret);
    let mut reservations = Vec::new();
    let mut node_endpoints = HashMap::new();
    let mut rules = Vec::new();
    for (i, node) in nodes.iter().enumerate() {
        let listener = TcpListener::bind("127.0.0.1:0").map_err(|_| "无法分配节点专用端口")?;
        let addr = listener.local_addr().map_err(|_| "无法读取节点专用端口")?;
        let tag = format!("pinned-{i}");
        config["inbounds"].as_array_mut().unwrap().push(json!({"type": "mixed", "tag": tag, "listen": "127.0.0.1", "listen_port": addr.port(), "users": [{"username": "boost", "password": secret}]}));
        rules.push(json!({"inbound": [tag], "action": "route", "outbound": format!("node-{i}")}));
        node_endpoints.insert(node.id.clone(), format!("http://boost:{secret}@{addr}"));
        reservations.push(listener);
    }
    config["route"]["rules"] = json!(rules);
    customize(&mut config);
    drop(proxy);
    drop(controller);
    drop(reservations);
    let child = spawn_core(&config)?;
    let mut core = Core {
        child,
        config,
        endpoint: format!("http://boost:{secret}@{proxy_addr}"),
        controller: controller_addr,
        secret,
        node_endpoints,
    };
    let deadline = Instant::now() + Duration::from_secs(8);
    loop {
        if core
            .child
            .try_wait()
            .map_err(|_| "无法检查代理内核运行状态")?
            .is_some()
        {
            return Err(
                "sing-box 启动失败；请确认版本为 1.12+ 且包含 Clash API / uTLS，节点参数受到支持"
                    .into(),
            );
        }
        if TcpStream::connect_timeout(&proxy_addr, Duration::from_millis(100)).is_ok()
            && TcpStream::connect_timeout(&controller_addr, Duration::from_millis(100)).is_ok()
        {
            return Ok(core);
        }
        if Instant::now() >= deadline {
            return Err("代理内核启动超时".into());
        }
        std::thread::sleep(Duration::from_millis(40));
    }
}

pub(crate) fn apply(raw: Option<&str>) -> Result<(), String> {
    let normalized = normalize(raw)?;
    let nodes = parse(normalized.as_deref())?;
    let policy = crate::proxy_policy::current();
    if policy.strategy == "manual"
        && !nodes.is_empty()
        && !nodes.iter().any(|n| n.id == policy.selected_id)
    {
        return Err("手动固定节点不存在，请先切换为自动策略".into());
    }
    let selection = (policy.strategy, policy.selected_id);
    let mut state = state().lock().unwrap_or_else(|e| e.into_inner());
    if state.raw == normalized && state.error.is_none() && state.selection == selection {
        return Ok(());
    }
    let core = if nodes.len() > 1 || nodes.first().is_some_and(|n| n.native) {
        Some(start(&nodes)?)
    } else {
        None
    };
    let endpoint = core
        .as_ref()
        .map(|c| c.endpoint.clone())
        .or_else(|| nodes.first().map(|n| n.url.clone()));
    *state = State {
        raw: normalized,
        endpoint,
        nodes,
        core,
        error: None,
        selection,
    };
    drop(state);
    start_supervisor();
    Ok(())
}

/// Startup failures must retain the configured route and block direct access.
pub(crate) fn load(raw: Option<&str>) {
    if let Err(error) = apply(raw) {
        let mut state = state().lock().unwrap_or_else(|e| e.into_inner());
        *state = State {
            raw: raw.map(str::to_string),
            endpoint: Some(BLOCKED_PROXY.into()),
            nodes: parse(raw).unwrap_or_default(),
            core: None,
            error: Some(error),
            selection: Default::default(),
        };
    }
}

pub(crate) fn endpoint() -> Option<String> {
    state()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .endpoint
        .clone()
}

pub(crate) fn configured() -> Option<String> {
    state()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .raw
        .clone()
}

fn start_supervisor() {
    static STARTED: OnceLock<()> = OnceLock::new();
    STARTED.get_or_init(|| {
        std::thread::spawn(|| loop {
            std::thread::sleep(Duration::from_secs(5));
            let mut state = state().lock().unwrap_or_else(|e| e.into_inner());
            if crate::shutdown_requested() {
                continue;
            }
            if let Some(core) = state.core.as_mut() {
                if matches!(core.child.try_wait(), Ok(Some(_))) {
                    match spawn_core(&core.config) {
                        Ok(child) => {
                            core.child = child;
                            state.error = None;
                        }
                        Err(error) => state.error = Some(error),
                    }
                }
            }
        });
    });
}

pub(crate) fn shutdown() {
    let mut state = state().lock().unwrap_or_else(|e| e.into_inner());
    state.core = None;
    if state.raw.is_some() {
        state.endpoint = Some(BLOCKED_PROXY.into());
        state.error = Some("代理内核已停止".into());
    }
}

pub(crate) fn settings() -> Value {
    crate::proxy_probe::locate_local_nodes();
    let (raw, nodes, controller, mut error) = {
        let state = state().lock().unwrap_or_else(|e| e.into_inner());
        (
            state.raw.clone(),
            state.nodes.clone(),
            state
                .core
                .as_ref()
                .map(|c| (c.controller, c.secret.clone())),
            state.error.clone(),
        )
    };
    let mut selected = None;
    let mut proxies = Value::Null;
    if let Some((controller, secret)) = controller {
        let result = reqwest::blocking::Client::builder()
            .no_proxy()
            .timeout(Duration::from_secs(2))
            .build()
            .and_then(|client| {
                client
                    .get(format!("http://{controller}/proxies"))
                    .bearer_auth(secret)
                    .send()?
                    .error_for_status()?
                    .json::<Value>()
            });
        match result {
            Ok(value) => {
                selected = value
                    .pointer(if crate::proxy_policy::current().strategy == "manual" {
                        "/proxies/selected/now"
                    } else {
                        "/proxies/auto/now"
                    })
                    .and_then(Value::as_str)
                    .map(str::to_string);
                proxies = value;
            }
            Err(_) => error = Some("代理内核状态暂不可用；请求不会回退直连".into()),
        }
    } else if nodes.len() == 1 && !nodes[0].native && error.is_none() {
        selected = Some("node-0".into());
    }
    let statuses: Vec<_> = nodes.iter().enumerate().map(|(i, node)| {
        let tag = format!("node-{i}");
        let latency = proxies.get("proxies").and_then(|p| p.get(&tag)).and_then(|p| p.get("history"))
            .and_then(Value::as_array).and_then(|h| h.last()).and_then(|h| h.get("delay")).and_then(Value::as_u64).filter(|d| *d > 0);
        let measurement = crate::proxy_probe::get(&node.id);
        let (code, country) = crate::proxy_policy::label_country(&node.name);
        json!({"id": node.id, "name": node.name, "protocol": node.outbound["type"],
            "countryCode": if measurement.country_code.is_empty() { code } else { &measurement.country_code },
            "country": if measurement.country.is_empty() { country } else { &measurement.country },
            "countrySource": if measurement.country_code.is_empty() { "label" } else { "measured" },
            "latencyMs": measurement.latency_ms.or(latency.map(|v| v as f64)), "measurement": measurement,
            "selected": selected.as_deref() == Some(tag.as_str())})
    }).collect();
    json!({"proxyUrl": raw, "envKey": "BOOST_UPSTREAM_PROXY_URL", "requiresRestart": false,
        "automatic": crate::proxy_policy::current().strategy != "manual", "nodes": statuses, "error": error,
        "strategy": crate::proxy_policy::current().strategy, "selectedId": crate::proxy_policy::current().selected_id,
        "bindings": crate::proxy_policy::current().bindings, "testRunning": crate::proxy_probe::running(), "kernel": crate::proxy_kernel::status()})
}

pub(crate) fn core_running() -> bool {
    state()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .core
        .is_some()
}
pub(crate) fn validation_config() -> Value {
    let state = state().lock().unwrap_or_else(|e| e.into_inner());
    if let Some(core) = &state.core {
        return core.config.clone();
    }
    if !state.nodes.is_empty() {
        return config(
            &state.nodes,
            0,
            "127.0.0.1:0".parse().unwrap(),
            "validation",
        );
    }
    json!({"outbounds": [{"type": "direct", "tag": "validation"}]})
}
pub(crate) fn restart() -> Result<(), String> {
    if crate::shutdown_requested() {
        return Err("服务已停止，取消内核重载".into());
    }
    let previous = state()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .error
        .replace("正在重新加载内核".into());
    let raw = configured();
    if let Err(error) = crate::gateway::set_upstream_proxy_url(raw.as_deref()) {
        state().lock().unwrap_or_else(|e| e.into_inner()).error = previous;
        return Err(error);
    }
    Ok(())
}
pub(crate) fn endpoint_for_account(account: &str) -> Option<String> {
    let policy = crate::proxy_policy::current();
    let id = policy.bindings.get(account)?;
    let state = state().lock().unwrap_or_else(|e| e.into_inner());
    Some(node_endpoint(&state, id).unwrap_or_else(|| BLOCKED_PROXY.into()))
}
fn node_endpoint(state: &State, id: &str) -> Option<String> {
    if let Some(core) = &state.core {
        return core.node_endpoints.get(id).cloned();
    }
    state
        .nodes
        .iter()
        .find(|n| n.id == id && !n.native)
        .map(|n| n.url.clone())
}
pub(crate) fn probe_targets(id: Option<&str>) -> Result<Vec<(String, String)>, String> {
    let state = state().lock().unwrap_or_else(|e| e.into_inner());
    if state.error.is_some() {
        return Err("代理内核不可用，请先安装或更新内核".into());
    }
    let targets: Vec<_> = state
        .nodes
        .iter()
        .filter(|n| id.is_none() || id == Some(n.id.as_str()))
        .filter_map(|n| node_endpoint(&state, &n.id).map(|e| (n.id.clone(), e)))
        .collect();
    if targets.is_empty() {
        return Err("没有可测速的节点".into());
    }
    Ok(targets)
}

pub(crate) fn local_probe_targets() -> Vec<(String, String)> {
    let state = state().lock().unwrap_or_else(|e| e.into_inner());
    state
        .nodes
        .iter()
        .filter(|n| {
            let host = n.outbound["server"].as_str().unwrap_or("");
            !n.native
                && (host.eq_ignore_ascii_case("localhost")
                    || host
                        .parse::<std::net::IpAddr>()
                        .is_ok_and(|ip| ip.is_loopback()))
        })
        .filter_map(|n| node_endpoint(&state, &n.id).map(|endpoint| (n.id.clone(), endpoint)))
        .collect()
}

pub(crate) fn action(action: &str, options: &Value) -> Result<Value, String> {
    let raw = crate::gateway::configured_upstream_proxy_url();
    if matches!(action, "import" | "remove" | "strategy" | "bind")
        && (crate::proxy_probe::running() || crate::proxy_kernel::busy())
    {
        return Err("请等待测速或内核任务完成后修改配置".into());
    }
    match action {
        "import" => {
            let incoming = options["text"].as_str().ok_or("缺少节点内容")?;
            let text = if options["replace"] == true {
                incoming.to_string()
            } else {
                format!("{}\n{incoming}", raw.unwrap_or_default())
            };
            save_nodes(&text)?;
            crate::proxy_probe::locate_local_nodes();
        }
        "remove" => {
            let id = options["nodeId"].as_str().ok_or("缺少节点 ID")?;
            let nodes = parse(raw.as_deref())?;
            if !nodes.iter().any(|n| n.id == id) {
                return Err("节点不存在".into());
            }
            let text = nodes
                .into_iter()
                .filter(|n| n.id != id)
                .map(|n| n.url)
                .collect::<Vec<_>>()
                .join("\n");
            save_nodes(&text)?;
        }
        "strategy" => {
            let old = crate::proxy_policy::current();
            let mut policy = old.clone();
            policy.strategy = options["strategy"].as_str().ok_or("缺少选择策略")?.into();
            policy.selected_id = options["nodeId"].as_str().unwrap_or("").into();
            if policy.strategy == "manual"
                && !parse(raw.as_deref())?
                    .iter()
                    .any(|n| n.id == policy.selected_id)
            {
                return Err("请选择存在的节点".into());
            }
            crate::proxy_policy::save(policy)?;
            if let Err(error) = crate::gateway::set_upstream_proxy_url(raw.as_deref()) {
                let _ = crate::proxy_policy::save(old);
                return Err(error);
            }
        }
        "bind" => {
            let account = options["accountId"].as_str().ok_or("缺少账号 ID")?;
            let storage = crate::storage_helpers::open_storage().ok_or("数据库不可用")?;
            if storage
                .find_account_by_id(account)
                .map_err(|_| "读取账号失败")?
                .is_none()
            {
                return Err("账号不存在".into());
            }
            let id = options["nodeId"].as_str().unwrap_or("");
            let mut policy = crate::proxy_policy::current();
            if id.is_empty() {
                policy.bindings.remove(account);
            } else {
                if !parse(raw.as_deref())?.iter().any(|n| n.id == id) {
                    return Err("节点不存在".into());
                }
                policy.bindings.insert(account.into(), id.into());
            }
            crate::proxy_policy::save(policy)?;
        }
        "test" => crate::proxy_probe::start(options["nodeId"].as_str())?,
        "cancelTest" => crate::proxy_probe::cancel(),
        "coreCheck" => crate::proxy_kernel::start(false)?,
        "coreScan" => crate::proxy_kernel::scan()?,
        "coreInstall" => crate::proxy_kernel::install()?,
        "coreUpdate" => crate::proxy_kernel::start(true)?,
        "coreAuto" => {
            let mut policy = crate::proxy_policy::current();
            policy.auto_update = options["enabled"].as_bool().ok_or("缺少自动更新开关")?;
            crate::proxy_policy::save(policy)?;
            crate::proxy_kernel::start_automatic();
        }
        _ => return Err("不支持的网络管理操作".into()),
    }
    Ok(settings())
}

fn save_nodes(text: &str) -> Result<(), String> {
    let normalized = normalize(Some(text))?;
    match crate::set_gateway_upstream_proxy_url(normalized.as_deref()) {
        Ok(_) => Ok(()),
        Err(error) if !core_running() => {
            // Import remains usable before installing the core; retain nodes and
            // block their traffic until installation, rather than losing input.
            let storage = crate::storage_helpers::open_storage().ok_or(error)?;
            storage
                .set_app_setting(
                    crate::app_settings::APP_SETTING_GATEWAY_UPSTREAM_PROXY_URL_KEY,
                    normalized.as_deref().unwrap_or(""),
                    boost_core::storage::now_ts(),
                )
                .map_err(|_| "保存节点失败")?;
            std::env::set_var(
                "BOOST_UPSTREAM_PROXY_URL",
                normalized.as_deref().unwrap_or(""),
            );
            crate::gateway::reload_runtime_config_from_env();
            crate::usage_http::reload_usage_http_client_from_env();
            Ok(())
        }
        Err(error) => Err(error),
    }
}

#[cfg(test)]
#[path = "upstream_proxy_tests.rs"]
mod tests;
