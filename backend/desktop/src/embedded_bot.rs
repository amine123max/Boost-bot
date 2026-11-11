use std::fs::{self, File};
use std::io::{self, Cursor};
use std::path::{Path, PathBuf};

#[cfg(feature = "portable-runtime")]
pub(crate) fn prepare(cache: &Path) -> io::Result<PathBuf> {
    static ARCHIVE: &[u8] = include_bytes!(env!("BOOST_EMBEDDED_BOT_ARCHIVE"));
    let directory = cache
        .join("bot-runtime")
        .join(env!("BOOST_EMBEDDED_BOT_DIGEST"));
    unpack_runtime(ARCHIVE, &directory)?;
    Ok(directory)
}

fn required_files() -> [&'static str; 3] {
    [
        "dist/src/boost-host.js",
        "package.json",
        if cfg!(windows) {
            "bin/node.exe"
        } else {
            "bin/node"
        },
    ]
}

fn unpack_runtime(bytes: &[u8], directory: &Path) -> io::Result<()> {
    let complete = directory.join(".ready");
    if complete.is_file()
        && required_files()
            .iter()
            .all(|path| directory.join(path).is_file())
    {
        return Ok(());
    }
    if complete.exists() {
        fs::remove_file(&complete)?;
    }
    fs::create_dir_all(directory)?;
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes))?;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index)?;
        let relative = entry.enclosed_name().ok_or_else(|| {
            io::Error::new(io::ErrorKind::InvalidData, "Unsafe embedded runtime path")
        })?;
        if entry
            .unix_mode()
            .is_some_and(|mode| mode & 0o170000 == 0o120000)
        {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "Embedded runtime symlinks are not supported",
            ));
        }
        let destination = directory.join(relative);
        if entry.is_dir() {
            fs::create_dir_all(destination)?;
        } else {
            if let Some(parent) = destination.parent() {
                fs::create_dir_all(parent)?;
            }
            io::copy(&mut entry, &mut File::create(destination)?)?;
        }
    }
    if !required_files()
        .iter()
        .all(|path| directory.join(path).is_file())
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Embedded Bot runtime is incomplete",
        ));
    }
    fs::write(complete, b"ready")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static NEXT: AtomicUsize = AtomicUsize::new(0);
    struct TestDirectory {
        path: PathBuf,
        parent: PathBuf,
    }
    impl TestDirectory {
        fn new() -> Self {
            let parent = std::env::temp_dir().canonicalize().unwrap();
            let path = parent.join(format!(
                "boost-embedded-runtime-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir(&path).unwrap();
            Self { path, parent }
        }
    }
    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let actual = self.path.canonicalize().unwrap();
            assert_eq!(actual.parent(), Some(self.parent.as_path()));
            assert!(actual
                .file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("boost-embedded-runtime-"));
            fs::remove_dir_all(actual).unwrap();
        }
    }
    fn archive(paths: &[&str]) -> Vec<u8> {
        let mut archive = zip::ZipWriter::new(Cursor::new(Vec::new()));
        for path in paths {
            archive
                .start_file(*path, zip::write::SimpleFileOptions::default())
                .unwrap();
            archive.write_all(b"runtime fixture").unwrap();
        }
        archive.finish().unwrap().into_inner()
    }
    #[test]
    fn extracts_complete_runtime_and_reuses_cache() {
        let temp = TestDirectory::new();
        unpack_runtime(&archive(&required_files()), &temp.path).unwrap();
        assert!(temp.path.join(".ready").is_file());
        unpack_runtime(b"cache should avoid reopening the archive", &temp.path).unwrap();
        fs::remove_file(temp.path.join("package.json")).unwrap();
        unpack_runtime(&archive(&required_files()), &temp.path).unwrap();
        assert!(temp.path.join("package.json").is_file());
    }
    #[test]
    fn rejects_incomplete_and_escaping_runtime_archives() {
        let temp = TestDirectory::new();
        assert!(unpack_runtime(&archive(&["package.json"]), &temp.path).is_err());
        assert!(!temp.path.join(".ready").exists());
        assert!(unpack_runtime(&archive(&["../escape"]), &temp.path).is_err());
        assert!(!temp.path.join(".ready").exists());
    }
}
