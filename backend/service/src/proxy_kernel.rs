//! Official sing-box releases, verified against GitHub's published SHA-256.
//! Updates install a new managed binary; other applications' cores are untouched.
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

#[derive(Default)]
struct Status {
    busy: bool,
    phase: String,
    version: String,
    latest: String,
    error: String,
    checked_at: Option<i64>,
}
fn cell() -> &'static Mutex<Status> {
    static CELL: OnceLock<Mutex<Status>> = OnceLock::new();
    CELL.get_or_init(|| Mutex::new(Status::default()))
}
pub(crate) fn executable() -> PathBuf {
    crate::proxy_core_discovery::find(false)
        .map(|c| c.path)
        .unwrap_or_else(|| {
            PathBuf::from(if cfg!(windows) {
                "sing-box.exe"
            } else {
                "sing-box"
            })
        })
}
fn command(path: &std::path::Path) -> Command {
    let mut command = Command::new(path);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    command
}
fn installed_version() -> String {
    crate::proxy_core_discovery::find(false)
        .map(|c| c.version)
        .unwrap_or_default()
}
pub(crate) fn status() -> Value {
    let local = crate::proxy_core_discovery::find(false);
    let status = cell().lock().unwrap_or_else(|e| e.into_inner());
    json!({"busy": status.busy, "phase": status.phase, "installedVersion": local.as_ref().map(|c| c.version.as_str()).unwrap_or(""),
        "localPath": local.as_ref().map(|c| c.path.to_string_lossy().to_string()).unwrap_or_default(),
        "source": local.as_ref().map(|c| c.source).unwrap_or("missing"),
        "latestVersion": status.latest, "error": status.error, "checkedAt": status.checked_at, "autoUpdate": crate::proxy_policy::current().auto_update})
}
pub(crate) fn busy() -> bool {
    cell().lock().unwrap_or_else(|e| e.into_inner()).busy
}
pub(crate) fn start(update: bool) -> Result<(), String> {
    start_job(if update { "update" } else { "check" })
}
pub(crate) fn install() -> Result<(), String> {
    start_job("install")
}
pub(crate) fn scan() -> Result<(), String> {
    start_job("scan")
}
fn start_job(mode: &'static str) -> Result<(), String> {
    if crate::proxy_probe::running() {
        return Err("请等待测速完成后更新内核".into());
    }
    let mut status = cell().lock().unwrap_or_else(|e| e.into_inner());
    if status.busy {
        return Err("内核任务正在进行中".into());
    }
    status.busy = true;
    status.error.clear();
    status.phase = "scanning".into();
    drop(status);
    std::thread::spawn(move || {
        let result = (|| {
            let local = crate::proxy_core_discovery::find(true);
            if mode == "scan" || (mode == "install" && local.is_some()) {
                let local = local.ok_or("未找到可用的本地 sing-box 1.12+，可以选择安装内核")?;
                // Retry previously blocked nodes with the discovered local core.
                if crate::upstream_proxy::configured().is_some()
                    && !crate::upstream_proxy::core_running()
                {
                    crate::upstream_proxy::restart()?;
                }
                cell().lock().unwrap_or_else(|e| e.into_inner()).version = local.version;
                return Ok(());
            }
            cell().lock().unwrap_or_else(|e| e.into_inner()).phase = "checking".into();
            run(mode != "check")
        })();
        let mut status = cell().lock().unwrap_or_else(|e| e.into_inner());
        status.busy = false;
        match result {
            Ok(()) => status.phase = "ready".into(),
            Err(error) => {
                status.phase = "failed".into();
                status.error = error;
            }
        }
    });
    Ok(())
}
fn bounded_text(response: reqwest::blocking::Response) -> Result<String, String> {
    let mut body = String::new();
    response
        .error_for_status()
        .map_err(|_| "官方发布信息请求失败")?
        .take(8_000_000)
        .read_to_string(&mut body)
        .map_err(|_| "无法读取官方发布信息")?;
    Ok(body)
}
fn release_version(url: &url::Url) -> Result<String, String> {
    let version = url
        .path_segments()
        .and_then(|mut s| s.next_back())
        .unwrap_or("")
        .trim_start_matches('v');
    if !regex::Regex::new(r"^1\.[0-9]+\.[0-9]+$")
        .unwrap()
        .is_match(version)
    {
        return Err("官方版本号格式无效".into());
    }
    Ok(version.into())
}
fn archive_name(version: &str) -> Result<(String, String), String> {
    let os = match std::env::consts::OS {
        "windows" => "windows",
        "linux" => "linux",
        "macos" => "darwin",
        _ => return Err("当前系统不支持在线内核更新".into()),
    };
    let arch = match std::env::consts::ARCH {
        "x86_64" => "amd64",
        "aarch64" => "arm64",
        _ => return Err("当前架构不支持在线内核更新".into()),
    };
    let base = format!("sing-box-{version}-{os}-{arch}");
    Ok((
        format!("{base}.{}", if cfg!(windows) { "zip" } else { "tar.gz" }),
        base,
    ))
}
fn digest_from_html(html: &str, name: &str) -> Result<String, String> {
    let marker = format!("digest for {name}\"");
    let at = html
        .find(&marker)
        .ok_or("官方发布页缺少内核 SHA-256 校验值")?;
    regex::Regex::new(r#"value="sha256:([a-f0-9]{64})""#)
        .unwrap()
        .captures(&html[at..html.len().min(at + 1500)])
        .and_then(|c| c.get(1))
        .map(|c| c.as_str().to_string())
        .ok_or_else(|| "官方内核校验值格式无效".into())
}
fn run(update: bool) -> Result<(), String> {
    // Explicit core installation must also work before any proxy core exists.
    let mut builder = reqwest::blocking::Client::builder()
        .no_proxy()
        .user_agent("Boost proxy core updater")
        .timeout(Duration::from_secs(180))
        .connect_timeout(Duration::from_secs(15));
    if crate::upstream_proxy::core_running() {
        if let Some(endpoint) = crate::upstream_proxy::endpoint() {
            builder =
                builder.proxy(reqwest::Proxy::all(endpoint).map_err(|_| "内核下载代理不可用")?);
        }
    }
    let client = builder.build().map_err(|_| "无法创建内核更新连接")?;
    let response = client
        .get("https://github.com/SagerNet/sing-box/releases/latest")
        .send()
        .map_err(|_| "无法连接 sing-box 官方发布页")?
        .error_for_status()
        .map_err(|_| "无法读取官方版本")?;
    let version = release_version(response.url())?;
    let installed = installed_version();
    {
        let mut status = cell().lock().unwrap_or_else(|e| e.into_inner());
        status.latest = version.clone();
        status.version = installed.clone();
        status.checked_at = Some(boost_core::storage::now_ts());
    }
    if !update || installed == version {
        return Ok(());
    }
    let (archive, base) = archive_name(&version)?;
    let html = bounded_text(
        client
            .get(format!(
                "https://github.com/SagerNet/sing-box/releases/expanded_assets/v{version}"
            ))
            .send()
            .map_err(|_| "无法获取官方内核校验值")?,
    )?;
    let digest = digest_from_html(&html, &archive)?;
    cell().lock().unwrap_or_else(|e| e.into_inner()).phase = "downloading".into();
    let response = client
        .get(format!(
            "https://github.com/SagerNet/sing-box/releases/download/v{version}/{archive}"
        ))
        .send()
        .map_err(|_| "内核下载失败")?
        .error_for_status()
        .map_err(|_| "官方内核下载失败")?;
    let mut bytes = Vec::new();
    response
        .take(128_000_001)
        .read_to_end(&mut bytes)
        .map_err(|_| "内核下载中断")?;
    if bytes.len() > 128_000_000 || format!("{:x}", Sha256::digest(&bytes)) != digest {
        return Err("内核完整性校验失败，未安装更新".into());
    }
    let root = crate::process_env::db_dir().join("proxy-core");
    std::fs::create_dir_all(&root).map_err(|_| "无法创建托管内核目录")?;
    let suffix: String = rand::random::<u64>().to_string();
    let archive_path = root.join(format!(
        "download-{suffix}.{}",
        if cfg!(windows) { "zip" } else { "tar.gz" }
    ));
    let binary_name = if cfg!(windows) {
        "sing-box.exe"
    } else {
        "sing-box"
    };
    let binary = root.join(format!(
        "sing-box-{version}-{suffix}{}",
        if cfg!(windows) { ".exe" } else { "" }
    ));
    struct Cleanup {
        archive: PathBuf,
        binary: Option<PathBuf>,
    }
    impl Drop for Cleanup {
        fn drop(&mut self) {
            let _ = std::fs::remove_file(&self.archive);
            if let Some(p) = &self.binary {
                let _ = std::fs::remove_file(p);
            }
        }
    }
    let mut cleanup = Cleanup {
        archive: archive_path.clone(),
        binary: Some(binary.clone()),
    };
    std::fs::write(&archive_path, bytes).map_err(|_| "无法写入内核下载文件")?;
    cell().lock().unwrap_or_else(|e| e.into_inner()).phase = "installing".into();
    let file = std::fs::File::create(&binary).map_err(|_| "无法创建新内核文件")?;
    let status = command(std::path::Path::new("tar"))
        .arg("-xOf")
        .arg(&archive_path)
        .arg(format!("{base}/{binary_name}"))
        .stdout(Stdio::from(file))
        .stderr(Stdio::null())
        .status()
        .map_err(|_| "无法运行 tar 解包程序，请安装系统 tar 工具")?;
    if !status.success() {
        return Err("官方内核解包失败".into());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&binary, std::fs::Permissions::from_mode(0o700))
            .map_err(|_| "无法设置内核执行权限")?;
    }
    let output = command(&binary)
        .arg("version")
        .output()
        .map_err(|_| "新内核无法运行")?;
    let info = String::from_utf8_lossy(&output.stdout);
    if !output.status.success()
        || !info.starts_with(&format!("sing-box version {version}"))
        || !info.contains("with_clash_api")
        || !info.contains("with_utls")
    {
        return Err("新内核版本或 Clash API / uTLS 能力校验失败".into());
    }
    // Validate the active node configuration before replacing the running core.
    let mut check = command(&binary)
        .args(["check", "-c", "stdin"])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| "无法校验新内核配置")?;
    let config = crate::upstream_proxy::validation_config();
    let written = check.stdin.take().map(|mut stdin| {
        serde_json::to_writer(&mut stdin, &config)
            .and_then(|_| stdin.flush().map_err(serde_json::Error::io))
    });
    if !matches!(written, Some(Ok(()))) {
        let _ = check.kill();
        let _ = check.wait();
        return Err("无法写入内核校验配置".into());
    }
    if !check.wait().map_err(|_| "内核配置校验失败")?.success() {
        return Err("新内核不兼容当前节点配置，已保留原内核".into());
    }
    if crate::shutdown_requested() {
        return Err("服务已停止，取消内核更新".into());
    }
    let old = crate::proxy_policy::current();
    let mut policy = old.clone();
    policy.managed_core = binary.to_string_lossy().to_string();
    crate::proxy_policy::save(policy)?;
    if let Err(error) = crate::upstream_proxy::restart() {
        let _ = crate::proxy_policy::save(old.clone());
        return Err(error);
    }
    cleanup.binary = None;
    // This is an upgrade, not an archive: remove the superseded managed file.
    if !old.managed_core.is_empty() {
        let old_path = PathBuf::from(old.managed_core);
        if old_path.parent() == Some(root.as_path()) && old_path != binary {
            let _ = std::fs::remove_file(old_path);
        }
    }
    cell().lock().unwrap_or_else(|e| e.into_inner()).version = version;
    Ok(())
}
pub(crate) fn start_automatic() {
    static STARTED: OnceLock<()> = OnceLock::new();
    STARTED.get_or_init(|| {
        std::thread::spawn(|| {
            let mut last = 0;
            loop {
                std::thread::sleep(Duration::from_secs(30));
                let now = boost_core::storage::now_ts();
                if !crate::shutdown_requested()
                    && crate::proxy_policy::current().auto_update
                    && now - last >= 86400
                    && !busy()
                    && !crate::proxy_probe::running()
                {
                    if start(true).is_ok() {
                        last = now;
                    }
                }
            }
        });
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn digest_is_bound_to_the_exact_official_asset() {
        let digest = "a".repeat(64);
        let html = format!("<clipboard-copy aria-label=\"Copy to clipboard digest for wanted.zip\" type=\"button\" value=\"sha256:{digest}\">");
        assert_eq!(digest_from_html(&html, "wanted.zip").unwrap(), digest);
        assert!(digest_from_html(&html, "other.zip").is_err());
        assert!(release_version(
            &url::Url::parse("https://github.com/SagerNet/sing-box/releases/tag/v1.14.4").unwrap()
        )
        .is_ok());
        assert!(
            release_version(&url::Url::parse("https://example.com/../../malicious").unwrap())
                .is_err()
        );
    }

    #[test]
    #[ignore = "downloads and verifies the official sing-box release"]
    fn official_update_installs_a_verified_managed_core() {
        let _guard = crate::test_env_guard();
        let old = crate::proxy_policy::current();
        crate::initialize_storage_if_needed().unwrap();
        run(true).expect("install official verified core");
        let installed = crate::proxy_policy::current();
        let managed = PathBuf::from(&installed.managed_core);
        assert!(managed.is_file());
        assert_eq!(
            managed.parent().unwrap(),
            crate::process_env::db_dir().join("proxy-core")
        );
        assert!(!installed_version().is_empty());
        crate::upstream_proxy::shutdown();
        crate::proxy_policy::save(old).unwrap();
        std::fs::remove_file(managed).unwrap();
    }
}
