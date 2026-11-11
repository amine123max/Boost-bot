use serde::Serialize;
use std::collections::HashMap;
use std::io::Read;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex, OnceLock,
};
use std::time::{Duration, Instant};

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Measurement {
    pub state: String,
    pub latency_ms: Option<f64>,
    pub jitter_ms: Option<f64>,
    pub loss_percent: Option<f64>,
    pub download_mbps: Option<f64>,
    pub country_code: String,
    pub country: String,
    pub tested_at: Option<i64>,
    pub error: String,
}
static RUNNING: AtomicBool = AtomicBool::new(false);
static CANCEL: AtomicBool = AtomicBool::new(false);
fn results() -> &'static Mutex<HashMap<String, Measurement>> {
    static RESULTS: OnceLock<Mutex<HashMap<String, Measurement>>> = OnceLock::new();
    RESULTS.get_or_init(|| Mutex::new(HashMap::new()))
}
pub(crate) fn running() -> bool {
    RUNNING.load(Ordering::SeqCst)
}
pub(crate) fn cancel() {
    CANCEL.store(true, Ordering::SeqCst);
}
pub(crate) fn get(id: &str) -> Measurement {
    results()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .get(id)
        .cloned()
        .unwrap_or_default()
}

pub(crate) fn locate_local_nodes() {
    static ATTEMPTS: OnceLock<Mutex<HashMap<String, Instant>>> = OnceLock::new();
    let targets = crate::upstream_proxy::local_probe_targets()
        .into_iter()
        .filter(|(id, _)| {
            if !get(id).country_code.is_empty() {
                return false;
            }
            let mut attempts = ATTEMPTS
                .get_or_init(Default::default)
                .lock()
                .unwrap_or_else(|e| e.into_inner());
            if attempts
                .get(id)
                .is_some_and(|time| time.elapsed() < Duration::from_secs(60))
            {
                return false;
            }
            attempts.insert(id.clone(), Instant::now());
            true
        })
        .collect::<Vec<_>>();
    if targets.is_empty() {
        return;
    }
    std::thread::spawn(move || {
        for batch in targets.chunks(3) {
            std::thread::scope(|scope| {
                for (id, endpoint) in batch {
                    scope.spawn(move || {
                        if !get(id).country_code.is_empty() {
                            return;
                        }
                        let Ok(proxy) = reqwest::Proxy::all(endpoint) else {
                            return;
                        };
                        let Ok(client) = reqwest::blocking::Client::builder()
                            .no_proxy()
                            .proxy(proxy)
                            .timeout(Duration::from_secs(6))
                            .build()
                        else {
                            return;
                        };
                        let Ok(response) = client
                            .get("https://ipwho.is/")
                            .send()
                            .and_then(|r| r.error_for_status())
                        else {
                            return;
                        };
                        let mut body = String::new();
                        if response.take(65536).read_to_string(&mut body).is_err() {
                            return;
                        }
                        let Ok(value) = serde_json::from_str::<serde_json::Value>(&body) else {
                            return;
                        };
                        let Some((code, country)) = exit_country(&value) else {
                            return;
                        };
                        let mut results = results().lock().unwrap_or_else(|e| e.into_inner());
                        let measured = results.entry(id.clone()).or_default();
                        measured.country_code = code;
                        measured.country = country;
                    });
                }
            });
        }
    });
}

fn exit_country(value: &serde_json::Value) -> Option<(String, String)> {
    let code = value["country_code"].as_str()?;
    if value["success"] != true || code.len() != 2 || !code.bytes().all(|c| c.is_ascii_alphabetic())
    {
        return None;
    }
    Some((
        code.to_ascii_uppercase(),
        value["country"].as_str().unwrap_or("").into(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn local_port_country_requires_a_successful_real_ip_response() {
        assert_eq!(
            exit_country(
                &serde_json::json!({"success":true,"country_code":"jp","country":"Japan"})
            ),
            Some(("JP".into(), "Japan".into()))
        );
        assert_eq!(
            exit_country(&serde_json::json!({"success":false,"country_code":"JP"})),
            None
        );
        assert_eq!(
            exit_country(&serde_json::json!({"success":true,"country_code":"localhost"})),
            None
        );
    }
}

pub(crate) fn start(id: Option<&str>) -> Result<(), String> {
    let targets = crate::upstream_proxy::probe_targets(id)?;
    if RUNNING.swap(true, Ordering::SeqCst) {
        return Err("测速正在进行中".into());
    }
    CANCEL.store(false, Ordering::SeqCst);
    for (id, _) in &targets {
        results().lock().unwrap_or_else(|e| e.into_inner()).insert(
            id.clone(),
            Measurement {
                state: "pending".into(),
                ..Measurement::default()
            },
        );
    }
    std::thread::spawn(move || {
        struct Finish;
        impl Drop for Finish {
            fn drop(&mut self) {
                RUNNING.store(false, Ordering::SeqCst);
            }
        }
        let _finish = Finish;
        for batch in targets.chunks(3) {
            if CANCEL.load(Ordering::SeqCst) {
                break;
            }
            std::thread::scope(|scope| {
                for (id, endpoint) in batch {
                    scope.spawn(move || {
                        results().lock().unwrap_or_else(|e| e.into_inner()).insert(
                            id.clone(),
                            Measurement {
                                state: "running".into(),
                                ..Measurement::default()
                            },
                        );
                        let result = measure(endpoint);
                        results()
                            .lock()
                            .unwrap_or_else(|e| e.into_inner())
                            .insert(id.clone(), result);
                    });
                }
            });
        }
        for value in results()
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .values_mut()
        {
            if value.state == "pending" {
                value.state = "cancelled".into();
            }
        }
    });
    Ok(())
}

fn measure(endpoint: &str) -> Measurement {
    let mut result = Measurement {
        state: "failed".into(),
        tested_at: Some(boost_core::storage::now_ts()),
        ..Measurement::default()
    };
    let Ok(proxy) = reqwest::Proxy::all(endpoint) else {
        result.error = "代理入口不可用".into();
        return result;
    };
    let Ok(client) = reqwest::blocking::Client::builder()
        .no_proxy()
        .proxy(proxy)
        .timeout(Duration::from_secs(6))
        .connect_timeout(Duration::from_secs(4))
        .build()
    else {
        result.error = "无法创建测速连接".into();
        return result;
    };
    let mut samples = Vec::new();
    for _ in 0..3 {
        if CANCEL.load(Ordering::SeqCst) {
            result.state = "cancelled".into();
            return result;
        }
        let at = Instant::now();
        if client
            .get("https://www.gstatic.com/generate_204")
            .send()
            .and_then(|r| r.error_for_status())
            .is_ok()
        {
            samples.push(at.elapsed().as_secs_f64() * 1000.0);
        }
    }
    result.loss_percent = Some((3 - samples.len()) as f64 / 3.0 * 100.0);
    if samples.is_empty() {
        result.error = "连通性测试失败，请检查节点".into();
        return result;
    }
    let mean = samples.iter().sum::<f64>() / samples.len() as f64;
    result.latency_ms = Some(mean);
    result.jitter_ms = Some(
        (samples.iter().map(|s| (s - mean).powi(2)).sum::<f64>() / samples.len() as f64).sqrt(),
    );
    result.state = "success".into();
    if !CANCEL.load(Ordering::SeqCst) {
        let at = Instant::now();
        if let Ok(response) = client
            .get("https://speed.cloudflare.com/__down?bytes=1048576")
            .header("Accept-Encoding", "identity")
            .send()
            .and_then(|r| r.error_for_status())
        {
            let mut bytes = Vec::new();
            if response.take(1_048_576).read_to_end(&mut bytes).is_ok() && bytes.len() == 1_048_576
            {
                result.download_mbps =
                    Some(bytes.len() as f64 * 8.0 / at.elapsed().as_secs_f64() / 1_000_000.0);
            }
        }
        if let Ok(response) = client
            .get("https://ipwho.is/")
            .send()
            .and_then(|r| r.error_for_status())
        {
            let mut body = String::new();
            if response.take(65536).read_to_string(&mut body).is_ok() {
                if let Ok(value) = serde_json::from_str::<serde_json::Value>(&body) {
                    if value["success"] == true {
                        let code = value["country_code"].as_str().unwrap_or("");
                        if code.len() == 2 && code.bytes().all(|c| c.is_ascii_alphabetic()) {
                            result.country_code = code.to_ascii_uppercase();
                            result.country = value["country"].as_str().unwrap_or("").to_string();
                        }
                    }
                }
            }
        }
    }
    result
}
