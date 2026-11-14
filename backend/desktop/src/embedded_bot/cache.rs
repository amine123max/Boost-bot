//! Bounded portable runtime cache. Every Bot shares the current immutable bundle.
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use sysinfo::{Pid, ProcessRefreshKind, System, UpdateKind};

pub(super) fn schedule_prune(root: PathBuf, current: PathBuf) {
    // Large old dependency trees must not delay opening the application.
    if let Err(error) = std::thread::Builder::new()
        .name("boost-runtime-cleanup".into())
        .spawn(move || {
            if let Err(error) = prune_unused(&root, &current) {
                log::warn!("Could not retire unused Bot runtimes: {error}");
            }
        })
    {
        log::warn!("Could not schedule Bot runtime cleanup: {error}");
    }
}

fn prune_unused(root: &Path, current: &Path) -> io::Result<()> {
    let mut system = System::new();
    system.refresh_processes_specifics(
        ProcessRefreshKind::new()
            .with_exe(UpdateKind::Always)
            .with_cwd(UpdateKind::Always),
    );
    // If process inspection is unavailable, leave existing runtimes intact.
    if system.process(Pid::from_u32(std::process::id())).is_none() {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "Cannot inspect running processes",
        ));
    }
    let protected: Vec<PathBuf> = system
        .processes()
        .values()
        .flat_map(|process| [process.exe(), process.cwd()])
        .flatten()
        .filter_map(|path| path.canonicalize().ok())
        .collect();
    prune_with_paths(root, current, &protected)
}

fn prune_with_paths(root: &Path, current: &Path, protected: &[PathBuf]) -> io::Result<()> {
    let root = root.canonicalize()?;
    let current = current.canonicalize()?;
    if current.parent() != Some(root.as_path()) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Invalid runtime root",
        ));
    }
    let mut first_error = None;
    for entry in fs::read_dir(&root)? {
        let entry = entry?;
        let name = entry.file_name();
        let name = name.to_string_lossy();
        let digest = name.strip_suffix(".retired").unwrap_or(&name);
        let retired = name.ends_with(".retired");
        // A retired name records an interrupted cleanup, allowing the next
        // startup to finish even when .ready was already removed.
        if digest.len() != 64 || !digest.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            continue;
        }
        if !entry.file_type()?.is_dir() {
            continue;
        }
        let path = entry.path();
        if fs::symlink_metadata(&path)?.file_type().is_symlink()
            || (!retired
                && (!path.join(".ready").is_file()
                    || !super::required_files()
                        .iter()
                        .all(|file| path.join(file).is_file())))
        {
            continue;
        }
        let actual = path.canonicalize()?;
        if actual == current
            || actual.parent() != Some(root.as_path())
            || protected
                .iter()
                .any(|process_path| process_path.starts_with(&actual))
        {
            continue;
        }
        let retired_path = root.join(format!("{digest}.retired"));
        if !retired {
            if let Err(error) = fs::rename(&path, &retired_path) {
                first_error.get_or_insert(error);
                continue;
            }
        }
        if let Err(error) = fs::remove_dir_all(&retired_path) {
            first_error.get_or_insert(error);
        }
    }
    match first_error {
        Some(error) => Err(error),
        None => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::embedded_bot::{
        required_files,
        tests::{archive, TestDirectory},
        unpack_runtime,
    };

    fn bundle(root: &Path, digit: char) -> PathBuf {
        let path = root.join(digit.to_string().repeat(64));
        unpack_runtime(&archive(&required_files()), &path).unwrap();
        path
    }

    #[test]
    fn retires_only_unused_complete_bundles() {
        let temp = TestDirectory::new();
        let current = bundle(&temp.path, 'a');
        let old = bundle(&temp.path, 'b');
        let running = bundle(&temp.path, 'c');
        let partial = temp.path.join("d".repeat(64));
        fs::create_dir(&partial).unwrap();
        fs::write(partial.join("package.json"), b"partial").unwrap();
        let unknown = temp.path.join("sessions");
        fs::create_dir(&unknown).unwrap();
        let active_node = running.join(required_files()[2]).canonicalize().unwrap();
        prune_with_paths(&temp.path, &current, &[active_node]).unwrap();
        assert!(current.join(".ready").is_file());
        assert!(!old.exists());
        assert!(running.join(".ready").is_file());
        assert!(partial.exists());
        assert!(unknown.exists());
        prune_with_paths(&temp.path, &current, &[]).unwrap();
        assert!(!running.exists());
    }

    #[test]
    fn protects_custom_node_hosts_by_working_directory() {
        let temp = TestDirectory::new();
        let current = bundle(&temp.path, 'a');
        let running = bundle(&temp.path, 'b');
        prune_with_paths(&temp.path, &current, &[running.canonicalize().unwrap()]).unwrap();
        assert!(running.join(".ready").is_file());
    }

    #[test]
    fn rejects_unrelated_cache_roots() {
        let temp = TestDirectory::new();
        let current = bundle(&temp.path, 'a');
        let nested = temp.path.join("other");
        fs::create_dir(&nested).unwrap();
        assert!(prune_with_paths(&nested, &current, &[]).is_err());
        assert!(current.join(".ready").is_file());
    }

    #[test]
    fn resumes_an_interrupted_retirement() {
        let temp = TestDirectory::new();
        let current = bundle(&temp.path, 'a');
        let retired = temp.path.join(format!("{}.retired", "b".repeat(64)));
        fs::create_dir(&retired).unwrap();
        fs::write(retired.join("leftover.js"), b"interrupted cleanup").unwrap();
        prune_with_paths(&temp.path, &current, &[]).unwrap();
        assert!(!retired.exists());
        assert!(current.join(".ready").is_file());
    }

    #[cfg(windows)]
    #[test]
    fn preserves_a_runtime_with_a_running_executable() {
        use std::os::windows::process::CommandExt;
        use std::process::{Command, Stdio};
        let temp = TestDirectory::new();
        let current = bundle(&temp.path, 'a');
        let running = bundle(&temp.path, 'b');
        let executable = running.join(required_files()[2]);
        let ping = PathBuf::from(std::env::var_os("WINDIR").unwrap()).join("System32/ping.exe");
        fs::copy(ping, &executable).unwrap();
        let mut child = Command::new(&executable)
            .args(["-t", "127.0.0.1"])
            .creation_flags(0x08000000)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap();
        let result = prune_unused(&temp.path, &current);
        let retained = running.join(".ready").is_file();
        let _ = child.kill();
        child.wait().unwrap();
        result.unwrap();
        assert!(retained);
        prune_unused(&temp.path, &current).unwrap();
        assert!(!running.exists());
    }
}
