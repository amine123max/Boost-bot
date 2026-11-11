//! Local-first discovery. No network requests or changes to another app's core.
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

#[derive(Clone)]
pub(crate) struct LocalCore {
    pub path: PathBuf,
    pub version: String,
    pub source: &'static str,
}
struct Cache {
    managed: String,
    at: Instant,
    found: Option<LocalCore>,
}
fn cache() -> &'static Mutex<Option<Cache>> {
    static CACHE: OnceLock<Mutex<Option<Cache>>> = OnceLock::new();
    CACHE.get_or_init(Default::default)
}
fn filename() -> &'static str {
    if cfg!(windows) {
        "sing-box.exe"
    } else {
        "sing-box"
    }
}

pub(crate) fn version_from_output(output: &str) -> Option<String> {
    let version = output
        .lines()
        .next()?
        .strip_prefix("sing-box version ")?
        .trim();
    let parts = version
        .split('.')
        .map(str::parse::<u32>)
        .collect::<Result<Vec<_>, _>>()
        .ok()?;
    if parts.len() != 3
        || parts[0] < 1
        || (parts[0] == 1 && parts[1] < 12)
        || !output.contains("with_clash_api")
        || !output.contains("with_utls")
    {
        return None;
    }
    Some(version.to_string())
}
fn inspect(path: &Path, source: &'static str) -> Option<LocalCore> {
    if !path.is_file() {
        return None;
    }
    let mut command = Command::new(path);
    command
        .arg("version")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command.spawn().ok()?;
    let deadline = Instant::now() + Duration::from_secs(2);
    loop {
        match child.try_wait() {
            Ok(Some(status)) if status.success() => break,
            Ok(Some(_)) => return None,
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
            Ok(None) => {}
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            return None;
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    let output = child.wait_with_output().ok()?;
    let version = version_from_output(std::str::from_utf8(&output.stdout).ok()?)?;
    Some(LocalCore {
        path: path.to_path_buf(),
        version,
        source,
    })
}
fn add_layouts(candidates: &mut Vec<(PathBuf, &'static str)>, root: &Path, source: &'static str) {
    for relative in [
        "",
        "bin",
        "bin/sing_box",
        "bin/sing-box",
        "sing-box",
        "cores/sing-box",
        "resources/bin",
        "resources/sing-box",
    ] {
        candidates.push((root.join(relative).join(filename()), source));
    }
}
fn candidates(managed: &str) -> Vec<(PathBuf, &'static str)> {
    let mut candidates = Vec::new();
    if !managed.is_empty() {
        candidates.push((PathBuf::from(managed), "managed"));
    }
    if let Some(root) = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(Path::to_path_buf))
    {
        add_layouts(&mut candidates, &root, "application");
    }
    if let Some(paths) = std::env::var_os("PATH") {
        for path in std::env::split_paths(&paths) {
            candidates.push((path.join(filename()), "path"));
        }
    }
    // Query executable paths only. Do not read process arguments or credentials.
    let mut system = sysinfo::System::new();
    system.refresh_processes_specifics(
        sysinfo::ProcessRefreshKind::new().with_exe(sysinfo::UpdateKind::OnlyIfNotSet),
    );
    for process in system.processes().values() {
        if let Some(path) = process.exe() {
            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if name.eq_ignore_ascii_case(filename()) {
                candidates.push((path.to_path_buf(), "running"));
            } else if ["v2rayn.exe", "nekoray.exe", "nekobox.exe", "hiddify.exe"]
                .iter()
                .any(|n| name.eq_ignore_ascii_case(n))
            {
                if let Some(root) = path.parent() {
                    add_layouts(&mut candidates, root, "local-app");
                }
            }
        }
    }
    for key in [
        "LOCALAPPDATA",
        "ProgramFiles",
        "ProgramFiles(x86)",
        "USERPROFILE",
        "HOME",
    ] {
        if let Some(root) = std::env::var_os(key) {
            for relative in [
                "v2rayN",
                "Programs/v2rayN",
                "v2rayN-windows-64",
                "scoop/apps/v2rayn/current",
                "scoop/apps/sing-box/current",
                ".local/bin",
                "Applications/Hiddify.app/Contents/Resources",
            ] {
                add_layouts(
                    &mut candidates,
                    &PathBuf::from(&root).join(relative),
                    "local-app",
                );
            }
        }
    }
    #[cfg(windows)]
    for drive in b'C'..=b'Z' {
        let root = PathBuf::from(format!("{}:\\", drive as char));
        if !root.is_dir() {
            continue;
        }
        for relative in [
            "v2rayN",
            "v2rayN-windows-64",
            "Tools/v2rayN",
            "Program Files/v2rayN",
            "sing-box",
        ] {
            add_layouts(&mut candidates, &root.join(relative), "local-app");
        }
    }
    #[cfg(not(windows))]
    for root in [
        "/usr/local/bin",
        "/usr/bin",
        "/opt/homebrew/bin",
        "/opt/sing-box",
    ] {
        candidates.push((PathBuf::from(root).join(filename()), "system"));
    }
    candidates
}
pub(crate) fn find(force: bool) -> Option<LocalCore> {
    let managed = crate::proxy_policy::current().managed_core;
    let mut cache = cache().lock().unwrap_or_else(|e| e.into_inner());
    if !force {
        if let Some(cached) = cache.as_ref().filter(|c| c.managed == managed) {
            if let Some(found) = cached.found.as_ref().filter(|c| c.path.is_file()) {
                return Some(found.clone());
            }
            if cached.at.elapsed() < Duration::from_secs(60) {
                return None;
            }
        }
    }
    let mut seen = std::collections::HashSet::new();
    let found = candidates(&managed)
        .into_iter()
        .filter(|(path, _)| seen.insert(path.to_string_lossy().to_ascii_lowercase()))
        .find_map(|(path, source)| inspect(&path, source));
    *cache = Some(Cache {
        managed,
        at: Instant::now(),
        found: found.clone(),
    });
    found
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn discovery_rejects_old_or_incomplete_cores() {
        assert_eq!(
            version_from_output("sing-box version 1.13.19\nTags: with_utls,with_clash_api\n")
                .as_deref(),
            Some("1.13.19")
        );
        assert!(
            version_from_output("sing-box version 1.11.0\nTags: with_utls,with_clash_api")
                .is_none()
        );
        assert!(version_from_output("sing-box version 1.13.19\nTags: with_utls").is_none());
        assert!(version_from_output("other version 1.13.19").is_none());
    }
    #[test]
    #[ignore = "requires a local sing-box installation"]
    fn finds_a_real_local_core_without_downloading() {
        let _guard = crate::test_env_guard();
        let found = find(true).expect("discover local sing-box");
        assert!(found.path.is_file());
        assert!(!found.version.is_empty());
        eprintln!(
            "Using local sing-box {} at {}",
            found.version,
            found.path.display()
        );
    }
}
