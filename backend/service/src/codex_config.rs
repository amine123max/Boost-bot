use serde::Serialize;
use std::io::Read;
use std::path::{Path, PathBuf};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexConfig {
    pub(crate) path: String,
    pub(crate) content: String,
    pub(crate) exists: bool,
}

pub(crate) fn read() -> Result<CodexConfig, String> {
    let home = std::env::var("CODEX_HOME")
        .ok()
        .filter(|p| !p.trim().is_empty())
        .map(PathBuf::from)
        .or_else(|| {
            std::env::var("USERPROFILE")
                .ok()
                .filter(|p| !p.trim().is_empty())
                .map(|p| PathBuf::from(p).join(".codex"))
        })
        .or_else(|| {
            std::env::var("HOME")
                .ok()
                .filter(|p| !p.trim().is_empty())
                .map(|p| PathBuf::from(p).join(".codex"))
        })
        .ok_or_else(|| "无法解析 Codex 配置目录".to_string())?;
    read_path(&home.join("config.toml"))
}

fn read_path(path: &Path) -> Result<CodexConfig, String> {
    let display = path.to_string_lossy().to_string();
    let file = match std::fs::File::open(path) {
        Ok(file) => file,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            return Ok(CodexConfig {
                path: display,
                content: String::new(),
                exists: false,
            })
        }
        Err(err) => return Err(format!("无法读取 Codex config.toml：{err}")),
    };
    const LIMIT: u64 = 2 * 1024 * 1024;
    let mut bytes = Vec::new();
    file.take(LIMIT + 1)
        .read_to_end(&mut bytes)
        .map_err(|err| format!("读取 Codex 配置失败：{err}"))?;
    if bytes.len() as u64 > LIMIT {
        return Err("Codex config.toml 超过 2 MB".to_string());
    }
    let content =
        String::from_utf8(bytes).map_err(|_| "Codex config.toml 需要为 UTF-8 编码".to_string())?;
    Ok(CodexConfig {
        path: display,
        content,
        exists: true,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn config_view_reads_exact_content_without_creating_files() {
        let root = std::env::temp_dir().join(format!("boost-config-reader-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join("config.toml");
        let text = "model_provider = \"Boost\"\nmodel = \"gpt-5.4\"\n";
        std::fs::write(&path, text).unwrap();
        let result = read_path(&path).unwrap();
        assert!(result.exists);
        assert_eq!(result.content, text);
        assert_eq!(std::fs::read_dir(&root).unwrap().count(), 1);
        std::fs::remove_file(path).unwrap();
        std::fs::remove_dir(root).unwrap();
    }
    #[test]
    fn missing_config_is_reported_without_creating_it() {
        let path =
            std::env::temp_dir().join(format!("boost-absent-config-{}.toml", std::process::id()));
        let result = read_path(&path).unwrap();
        assert!(!result.exists);
        assert!(!path.exists());
    }
}
