use super::*;

#[test]
fn local_ports_accept_short_forms_and_do_not_invent_countries() {
    for input in ["7897", "127.0.0.1:7897", "localhost:7897", "[::1]:7897"] {
        let node = parse(Some(input)).unwrap().pop().unwrap();
        assert_eq!(node.outbound["server_port"], 7897);
        assert!(!node.native);
        assert!(node.url.starts_with("http://"));
        assert_eq!(crate::proxy_policy::label_country(&node.name).0, "");
    }
    assert!(parse(Some("0")).is_err());
    assert!(parse(Some("65536")).is_err());
    assert!(parse(Some("example.com:7897")).is_err());
    assert_eq!(parse(Some("80")).unwrap()[0].outbound["server_port"], 80);
}

#[test]
fn parses_trojan_and_anytls_share_links_without_losing_tls_options() {
    let nodes = parse(Some(concat!(
        "trojan://test-password@v6-jp.example.com:7001?allowInsecure=1&insecure=1&security=tls&sni=video.example.com&fp=chrome&type=tcp&headerType=none#%E6%97%A5%E6%9C%AC-4%20%28IPv6%29\n",
        "anytls://test-password@v4-jp.example.com:7001?insecure=1&security=tls&sni=127.0.0.1&fp=chrome&type=tcp&headerType=none#%E6%97%A5%E6%9C%AC-2"
    ))).unwrap();
    assert_eq!(nodes.len(), 2);
    assert_eq!(nodes[0].name, "日本-4 (IPv6)");
    assert_eq!(nodes[0].outbound["password"], "test-password");
    assert_eq!(nodes[0].outbound["server_port"], 7001);
    assert_eq!(nodes[0].outbound["tls"]["server_name"], "video.example.com");
    assert_eq!(nodes[0].outbound["tls"]["insecure"], true);
    assert_eq!(nodes[0].outbound["tls"]["utls"]["fingerprint"], "chrome");
    assert_eq!(nodes[1].outbound["type"], "anytls");
    assert_eq!(nodes[1].outbound["tls"]["server_name"], "127.0.0.1");
    assert!(!nodes[0].name.contains("test-password"));
}

#[test]
fn normalizes_multiline_and_preserves_encoded_credentials_and_ipv6() {
    let raw = "\r\n socks5://alice:p%40ss@[::1]:1080 \r\n\nhttp://127.0.0.1:7890\nhttp://127.0.0.1:7890\n";
    assert_eq!(
        normalize(Some(raw)).unwrap().unwrap(),
        "socks5h://alice:p%40ss@[::1]:1080\nhttp://127.0.0.1:7890"
    );
    let nodes = parse(Some(raw)).unwrap();
    assert_eq!(nodes[0].outbound["server"], "::1");
    assert_eq!(nodes[0].outbound["password"], "p@ss");
    assert_eq!(nodes[0].outbound["version"], "5");
    assert_eq!(normalize(Some(" \r\n ")).unwrap(), None);
}

#[test]
fn rejects_unsupported_transports_and_invalid_nodes_without_echoing_secrets() {
    for raw in [
        "trojan://secret@host:443?type=ws",
        "anytls://secret@host:443?security=reality",
        "anytls://secret@host:443?insecure=maybe",
        "trojan://host:443",
        "http://host:0",
        "http://user:secret@host/path",
        "ftp://user:secret@host:80",
        "not-a-url-secret",
    ] {
        let error = normalize(Some(raw)).unwrap_err();
        assert!(!error.contains("secret"), "{error}");
    }
    let too_many = (0..33)
        .map(|i| format!("http://127.0.0.1:{}", 1000 + i))
        .collect::<Vec<_>>()
        .join("\n");
    assert!(normalize(Some(&too_many)).unwrap_err().contains("32"));
}

#[test]
fn tls_validation_is_enabled_unless_explicitly_disabled() {
    let nodes = parse(Some(
        "trojan://secret@host:443\nhttps://user:p%40ss@host:8443",
    ))
    .unwrap();
    assert_eq!(nodes[0].outbound["tls"]["insecure"], false);
    assert_eq!(nodes[1].outbound["type"], "http");
    assert_eq!(nodes[1].outbound["tls"]["enabled"], true);
    assert_eq!(nodes[1].outbound["password"], "p@ss");
}

#[test]
fn auto_selection_has_no_direct_outbound_and_preserves_existing_connections() {
    let _guard = crate::test_env_guard();
    let nodes = parse(Some("http://127.0.0.1:7890\nanytls://secret@host:443")).unwrap();
    let config = config(
        &nodes,
        10000,
        "127.0.0.1:10001".parse().unwrap(),
        "local-secret",
    );
    assert_eq!(config["route"]["final"], "selected");
    assert_eq!(config["outbounds"][3]["type"], "selector");
    assert_eq!(config["outbounds"][2]["interval"], "1m");
    assert_eq!(config["outbounds"][2]["tolerance"], 200);
    assert_eq!(config["outbounds"][2]["interrupt_exist_connections"], false);
    assert!(config["outbounds"]
        .as_array()
        .unwrap()
        .iter()
        .all(|o| o["type"] != "direct"));
    assert_eq!(config["inbounds"][0]["listen"], "127.0.0.1");
    assert_eq!(
        config["inbounds"][0]["users"][0]["password"],
        "local-secret"
    );
    assert_eq!(
        config["experimental"]["clash_api"]["secret"],
        "local-secret"
    );
}

#[test]
fn startup_errors_keep_the_configured_proxy_and_block_direct_access() {
    let _guard = crate::test_env_guard();
    let original = configured();
    load(Some("unsupported://credential@host"));
    assert_eq!(endpoint().as_deref(), Some(BLOCKED_PROXY));
    assert_eq!(
        configured().as_deref(),
        Some("unsupported://credential@host")
    );
    assert!(settings()["error"].is_string());
    assert!(!settings()["error"].as_str().unwrap().contains("credential"));
    load(original.as_deref());
}

/// Run with an official sing-box 1.12+ on PATH. The live regressions use only
/// local mock proxies; no account credentials or real provider requests.
#[test]
#[ignore = "requires sing-box on PATH"]
fn real_core_routes_all_http_endpoint_shapes_and_recovers_after_proxy_failure() {
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    };
    use std::thread;
    let _guard = crate::test_env_guard();
    let stop = Arc::new(AtomicBool::new(false));
    let broken_a = Arc::new(AtomicBool::new(false));
    let broken_b = Arc::new(AtomicBool::new(false));
    let spawn_proxy = |label: &'static str, broken: Arc<AtomicBool>| {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let addr = listener.local_addr().unwrap();
        let stop = stop.clone();
        let handle = thread::spawn(move || {
            while !stop.load(Ordering::Relaxed) {
                if let Ok((mut stream, _)) = listener.accept() {
                    let broken = broken.clone();
                    thread::spawn(move || {
                        use std::io::{BufRead, BufReader, Read};
                        stream.set_nonblocking(false).unwrap();
                        stream
                            .set_read_timeout(Some(Duration::from_secs(2)))
                            .unwrap();
                        let mut reader = BufReader::new(&mut stream);
                        let read_request =
                            |reader: &mut BufReader<&mut TcpStream>| -> Option<String> {
                                let mut request = String::new();
                                let mut content_length = 0;
                                loop {
                                    let mut line = String::new();
                                    if reader.read_line(&mut line).ok()? == 0 {
                                        return None;
                                    }
                                    request.push_str(&line);
                                    if line == "\r\n" {
                                        break;
                                    }
                                    if let Some((key, value)) = line.split_once(':') {
                                        if key.eq_ignore_ascii_case("content-length") {
                                            content_length = value.trim().parse::<usize>().ok()?;
                                        }
                                    }
                                    if request.len() > 8192 {
                                        return None;
                                    }
                                }
                                if content_length > 8192 {
                                    return None;
                                }
                                let mut body = vec![0; content_length];
                                reader.read_exact(&mut body).ok()?;
                                request.push_str(&String::from_utf8_lossy(&body));
                                Some(request)
                            };
                        let Some(mut request) = read_request(&mut reader) else {
                            return;
                        };
                        if broken.load(Ordering::Relaxed) {
                            return;
                        }
                        if request.starts_with("CONNECT ") {
                            if reader
                                .get_mut()
                                .write_all(b"HTTP/1.1 200 Connection established\r\n\r\n")
                                .is_err()
                            {
                                return;
                            }
                            let Some(next) = read_request(&mut reader) else {
                                return;
                            };
                            request = next;
                        }
                        // B is sufficiently faster to exceed the configured tolerance.
                        if label == "A" {
                            thread::sleep(Duration::from_millis(350));
                        }
                        let body = if request.starts_with("HEAD ") {
                            String::new()
                        } else if request.contains("\"stream\":true") {
                            format!("data: {{\"node\":\"{label}\",\"tool_calls\":[{{\"id\":\"call_1\"}}]}}\n\ndata: [DONE]\n\n")
                        } else {
                            format!(
                                "{{\"node\":\"{label}\",\"tool_calls\":[{{\"id\":\"call_1\"}}]}}"
                            )
                        };
                        let content_type = if body.starts_with("data:") {
                            "text/event-stream"
                        } else {
                            "application/json"
                        };
                        let response = format!("HTTP/1.1 200 OK\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len());
                        let _ = reader.get_mut().write_all(response.as_bytes());
                    });
                } else {
                    thread::sleep(Duration::from_millis(10));
                }
            }
        });
        (addr, handle)
    };
    let (addr_a, handle_a) = spawn_proxy("A", broken_a.clone());
    let (addr_b, handle_b) = spawn_proxy("B", broken_b.clone());
    let nodes = parse(Some(&format!("http://{addr_a}#A\nhttp://{addr_b}#B"))).unwrap();
    let mut core_config = config(&nodes, 0, "127.0.0.1:0".parse().unwrap(), "test");
    // Validate the user's supported native link shapes against the actual core too.
    let native = parse(Some("trojan://secret@localhost:443?insecure=1&sni=localhost&fp=chrome&type=tcp&headerType=none\nanytls://secret@localhost:443?insecure=1&sni=127.0.0.1&fp=chrome&type=tcp&headerType=none")).unwrap();
    core_config["outbounds"]
        .as_array_mut()
        .unwrap()
        .extend(native.iter().enumerate().map(|(i, n)| {
            let mut outbound = n.outbound.clone();
            outbound["tag"] = json!(format!("native-{i}"));
            outbound
        }));
    let mut check = Command::new(core_path())
        .args(["check", "-c", "stdin"])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .spawn()
        .unwrap();
    serde_json::to_writer(check.stdin.take().unwrap(), &core_config).unwrap();
    assert!(check.wait().unwrap().success());
    let mut core = start_with(&nodes, |config| {
        config["outbounds"][2]["url"] = json!("http://probe.invalid/health");
        config["outbounds"][2]["interval"] = json!("1s");
    })
    .unwrap();
    let controller = reqwest::blocking::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(2))
        .build()
        .unwrap();
    let selected = || {
        controller
            .get(format!("http://{}/proxies/auto", core.controller))
            .bearer_auth(&core.secret)
            .send()
            .unwrap()
            .json::<Value>()
            .unwrap()["now"]
            .as_str()
            .unwrap()
            .to_string()
    };
    let wait_selected = |tag: &str| {
        let deadline = Instant::now() + Duration::from_secs(8);
        while selected() != tag {
            assert!(Instant::now() < deadline, "did not select {tag}");
            thread::sleep(Duration::from_millis(100));
        }
    };
    wait_selected("node-1");
    // Dedicated entrances always route to their node even when auto selected B.
    for (index, label) in [(0, "A"), (1, "B")] {
        let endpoint = core.node_endpoints.get(&nodes[index].id).unwrap();
        let pinned = reqwest::blocking::Client::builder()
            .no_proxy()
            .proxy(reqwest::Proxy::all(endpoint).unwrap())
            .timeout(Duration::from_secs(4))
            .build()
            .unwrap();
        let response = pinned
            .get("http://provider.invalid/v1/responses")
            .send()
            .unwrap()
            .text()
            .unwrap();
        assert!(
            response.contains(&format!("\"node\":\"{label}\"")),
            "account binding drifted from its fixed node"
        );
    }
    let client = reqwest::blocking::Client::builder()
        .no_proxy()
        .proxy(reqwest::Proxy::all(&core.endpoint).unwrap())
        .timeout(Duration::from_secs(4))
        .build()
        .unwrap();
    for path in ["/v1/responses", "/v1/chat/completions"] {
        for streaming in [false, true] {
            let response = client
                .post(format!("http://provider.invalid{path}"))
                .json(&json!({"stream": streaming, "tools": [{"type": "function"}]}))
                .send()
                .unwrap();
            assert!(response.status().is_success());
            let body = response.text().unwrap();
            assert!(body.contains("tool_calls"));
            assert!(body.contains("\"node\":\"B\""));
            assert_eq!(body.starts_with("data:"), streaming);
        }
    }
    broken_b.store(true, Ordering::Relaxed);
    wait_selected("node-0");
    assert!(client
        .get("http://provider.invalid/v1/responses")
        .send()
        .unwrap()
        .text()
        .unwrap()
        .contains("\"node\":\"A\""));
    broken_a.store(true, Ordering::Relaxed);
    let target = TcpListener::bind("127.0.0.1:0").unwrap();
    target.set_nonblocking(true).unwrap();
    assert!(client
        .get(format!(
            "http://{}/v1/responses",
            target.local_addr().unwrap()
        ))
        .send()
        .map(|r| !r.status().is_success())
        .unwrap_or(true));
    assert!(
        target.accept().is_err(),
        "all failed nodes must never bypass the proxy"
    );
    // Confirm that losing the entire core refuses traffic rather than reaching the target directly.
    core.child.kill().unwrap();
    core.child.wait().unwrap();
    assert!(client
        .get(format!(
            "http://{}/v1/responses",
            target.local_addr().unwrap()
        ))
        .send()
        .is_err());
    assert!(
        target.accept().is_err(),
        "a stopped core must never bypass the proxy"
    );
    drop(core);
    stop.store(true, Ordering::Relaxed);
    handle_a.join().unwrap();
    handle_b.join().unwrap();
}
