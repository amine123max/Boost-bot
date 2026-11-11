//! Service-port API payload traffic and resident memory for the status panel.
//! Management RPC/event polling and HTTP/TLS framing are deliberately excluded.
use serde::Serialize;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use sysinfo::{Pid, System};

static UPLOADED: AtomicU64 = AtomicU64::new(0);
static DOWNLOADED: AtomicU64 = AtomicU64::new(0);
static ACTIVE: AtomicU64 = AtomicU64::new(0);
static ADDRESS: OnceLock<Mutex<String>> = OnceLock::new();

pub(crate) struct ActiveTransfer;
impl ActiveTransfer {
    pub(crate) fn new() -> Self {
        ACTIVE.fetch_add(1, Ordering::Relaxed);
        Self
    }
}
impl Drop for ActiveTransfer {
    fn drop(&mut self) {
        ACTIVE.fetch_sub(1, Ordering::Relaxed);
    }
}

pub(crate) fn set_address(addr: &str) {
    *ADDRESS
        .get_or_init(|| Mutex::new(String::new()))
        .lock()
        .unwrap_or_else(|e| e.into_inner()) = addr.to_string();
}
pub(crate) fn record_upload(bytes: usize) {
    UPLOADED.fetch_add(bytes as u64, Ordering::Relaxed);
}
pub(crate) fn record_download(bytes: usize) {
    DOWNLOADED.fetch_add(bytes as u64, Ordering::Relaxed);
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ServiceTelemetry {
    pub(crate) address: String,
    pub(crate) process_id: u32,
    pub(crate) upload_bytes_per_second: f64,
    pub(crate) download_bytes_per_second: f64,
    pub(crate) memory_bytes: Option<u64>,
    pub(crate) cpu_percent: Option<f32>,
    pub(crate) scope: &'static str,
    pub(crate) uploaded_bytes: u64,
    pub(crate) downloaded_bytes: u64,
    pub(crate) active_requests: u64,
    pub(crate) uptime_seconds: Option<u64>,
    pub(crate) version: &'static str,
    pub(crate) os: String,
    pub(crate) architecture: &'static str,
    pub(crate) cpu_model: String,
    pub(crate) logical_cores: usize,
    pub(crate) system_memory_bytes: u64,
}

struct Sampler {
    system: System,
    at: Instant,
    up: u64,
    down: u64,
    upload_rate: f64,
    download_rate: f64,
}

fn rate(current: u64, previous: u64, elapsed: Duration) -> f64 {
    if elapsed.is_zero() {
        return 0.0;
    }
    current.saturating_sub(previous) as f64 / elapsed.as_secs_f64()
}

pub(crate) fn snapshot() -> ServiceTelemetry {
    static SAMPLER: OnceLock<Mutex<Sampler>> = OnceLock::new();
    let sampler = SAMPLER.get_or_init(|| {
        let mut system = System::new();
        system.refresh_memory();
        system.refresh_cpu();
        Mutex::new(Sampler {
            system,
            at: Instant::now(),
            up: UPLOADED.load(Ordering::Relaxed),
            down: DOWNLOADED.load(Ordering::Relaxed),
            upload_rate: 0.0,
            download_rate: 0.0,
        })
    });
    let mut sample = sampler.lock().unwrap_or_else(|e| e.into_inner());
    let pid = Pid::from_u32(std::process::id());
    let elapsed = sample.at.elapsed();
    if elapsed >= Duration::from_millis(800) {
        let up = UPLOADED.load(Ordering::Relaxed);
        let down = DOWNLOADED.load(Ordering::Relaxed);
        sample.upload_rate = rate(up, sample.up, elapsed);
        sample.download_rate = rate(down, sample.down, elapsed);
        sample.up = up;
        sample.down = down;
        sample.at = Instant::now();
        sample.system.refresh_process(pid);
    } else if sample.system.process(pid).is_none() {
        sample.system.refresh_process(pid);
    }
    let process = sample.system.process(pid);
    let cores = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(1)
        .max(1);
    ServiceTelemetry {
        address: ADDRESS
            .get_or_init(|| Mutex::new(String::new()))
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone(),
        process_id: std::process::id(),
        upload_bytes_per_second: sample.upload_rate,
        download_bytes_per_second: sample.download_rate,
        memory_bytes: process.map(|p| p.memory()),
        cpu_percent: process.map(|p| (p.cpu_usage() / cores as f32).clamp(0.0, 100.0)),
        scope: "service_port_api_payload",
        uploaded_bytes: UPLOADED.load(Ordering::Relaxed),
        downloaded_bytes: DOWNLOADED.load(Ordering::Relaxed),
        active_requests: ACTIVE.load(Ordering::Relaxed),
        uptime_seconds: process.map(|p| p.run_time()),
        version: env!("CARGO_PKG_VERSION"),
        os: System::long_os_version().unwrap_or_else(|| std::env::consts::OS.to_string()),
        architecture: std::env::consts::ARCH,
        cpu_model: sample
            .system
            .cpus()
            .first()
            .map(|cpu| cpu.brand().to_string())
            .unwrap_or_default(),
        logical_cores: cores,
        system_memory_bytes: sample.system.total_memory(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rates_use_elapsed_time_and_handle_resets() {
        assert_eq!(rate(4096, 2048, Duration::from_secs(2)), 1024.0);
        assert_eq!(rate(10, 20, Duration::from_secs(1)), 0.0);
        assert_eq!(rate(10, 0, Duration::ZERO), 0.0);
    }
    #[test]
    fn snapshot_uses_current_service_process_and_camel_case_fields() {
        let value = serde_json::to_value(snapshot()).unwrap();
        assert_eq!(value["processId"], std::process::id());
        assert_eq!(value["scope"], "service_port_api_payload");
        assert!(value["memoryBytes"].as_u64().unwrap_or_default() > 0);
    }
}
