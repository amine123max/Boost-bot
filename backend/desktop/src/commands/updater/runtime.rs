use reqwest::blocking::Client;
use semver::Version;
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

pub(super) const PORTABLE_MARKER_FILE: &str = ".boost-portable";
pub(super) const USER_AGENT: &str = "Boost-Updater";
pub(super) const DEFAULT_UPDATE_REPO: &str = "amine123max/Boost-bot";

#[cfg(target_os = "windows")]
pub(super) const CREATE_NO_WINDOW: u32 = 0x08000000;

/// 函数 `now_unix_secs`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// - super: 参数 super
///
/// # 返回
/// 返回函数执行结果
pub(super) fn now_unix_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|v| v.as_secs())
        .unwrap_or(0)
}

/// 函数 `resolve_update_repo`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// - super: 参数 super
///
/// # 返回
/// 返回函数执行结果
pub(super) fn resolve_update_repo() -> String {
    configured_update_repo(
        std::env::var("BOOST_UPDATE_REPO").ok().as_deref(),
        Some(option_env!("BOOST_UPDATE_REPO").unwrap_or(DEFAULT_UPDATE_REPO)),
    )
}

fn configured_update_repo(runtime: Option<&str>, embedded: Option<&str>) -> String {
    runtime
        .into_iter()
        .chain(embedded)
        .map(str::trim)
        .find(|value| !value.is_empty())
        .unwrap_or_default()
        .to_string()
}

pub(super) fn validate_update_repo(repo: &str) -> Result<(), String> {
    if repo.is_empty() {
        return Err("尚未配置更新仓库。请使用你自己的 GitHub Releases 构建，或在构建/启动前设置 BOOST_UPDATE_REPO=你的账号/Boost-bot".to_string());
    }
    let parts: Vec<_> = repo.split('/').collect();
    if parts.len() != 2
        || parts
            .iter()
            .any(|part| part.is_empty() || *part == "." || *part == "..")
        || !parts[0]
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-')
        || !parts[1]
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"-_.".contains(&c))
    {
        return Err(format!("更新仓库配置无效 '{repo}'，应为 owner/repo 格式"));
    }
    Ok(())
}

/// 函数 `normalize_version`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// - super: 参数 super
///
/// # 返回
/// 返回函数执行结果
pub(super) fn normalize_version(input: &str) -> Result<Version, String> {
    let normalized = input.trim().trim_start_matches(['v', 'V']);
    Version::parse(normalized).map_err(|err| format!("版本号无效 '{input}'：{err}"))
}

/// 函数 `current_exe_path`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// - super: 参数 super
///
/// # 返回
/// 返回函数执行结果
pub(super) fn current_exe_path() -> Result<PathBuf, String> {
    std::env::current_exe().map_err(|err| format!("解析当前可执行文件路径失败：{err}"))
}

/// 函数 `current_mode_and_marker`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// - super: 参数 super
///
/// # 返回
/// 返回函数执行结果
pub(super) fn current_mode_and_marker() -> Result<(String, bool, PathBuf, PathBuf), String> {
    let exe = current_exe_path()?;
    let exe_dir = exe
        .parent()
        .ok_or_else(|| "解析可执行文件所在目录失败".to_string())?
        .to_path_buf();
    let marker = exe_dir.join(PORTABLE_MARKER_FILE);
    let by_marker = marker.is_file();
    let by_exe_name = exe
        .file_name()
        .and_then(|v| v.to_str())
        .map(|v| v.to_ascii_lowercase().contains("-portable"))
        .unwrap_or(false);
    let is_portable = cfg!(feature = "portable-runtime") || by_marker || by_exe_name;
    let mode = if is_portable { "portable" } else { "installer" }.to_string();
    Ok((mode, is_portable, exe, marker))
}

/// 函数 `env_flag`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// - name: 参数 name
///
/// # 返回
/// 返回函数执行结果
fn env_flag(name: &str) -> Option<bool> {
    let raw = std::env::var(name).ok()?;
    let normalized = raw.trim().to_ascii_lowercase();
    match normalized.as_str() {
        "1" | "true" | "yes" | "on" => Some(true),
        "0" | "false" | "no" | "off" => Some(false),
        _ => None,
    }
}

/// 函数 `should_include_prerelease_updates_with_override`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// - super: 参数 super
///
/// # 返回
/// 返回函数执行结果
pub(super) fn should_include_prerelease_updates_with_override(
    _current_version: &Version,
    override_value: Option<bool>,
) -> bool {
    override_value.unwrap_or(false)
}

/// 函数 `should_include_prerelease_updates`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// - super: 参数 super
///
/// # 返回
/// 返回函数执行结果
pub(super) fn should_include_prerelease_updates(current_version: &Version) -> bool {
    should_include_prerelease_updates_with_override(
        current_version,
        env_flag("BOOST_UPDATE_PRERELEASE"),
    )
}

/// 函数 `http_client`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// - super: 参数 super
///
/// # 返回
/// 返回函数执行结果
pub(super) fn http_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|err| format!("创建 HTTP 客户端失败：{err}"))
}

/// 函数 `resolve_github_token`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// - super: 参数 super
///
/// # 返回
/// 返回函数执行结果
pub(super) fn resolve_github_token() -> Option<String> {
    for key in ["BOOST_GITHUB_TOKEN", "GITHUB_TOKEN", "GH_TOKEN"] {
        if let Ok(value) = std::env::var(key) {
            let trimmed = value.trim().to_string();
            if !trimmed.is_empty() {
                return Some(trimmed);
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use semver::Version;

    use super::{
        configured_update_repo, normalize_version, should_include_prerelease_updates_with_override,
        validate_update_repo,
    };

    #[test]
    fn update_repository_uses_only_explicit_configuration() {
        assert_eq!(configured_update_repo(None, None), "");
        assert_eq!(
            configured_update_repo(None, Some(" owner/Boost-bot ")),
            "owner/Boost-bot"
        );
        assert_eq!(
            configured_update_repo(Some(" "), Some("owner/Boost-bot")),
            "owner/Boost-bot"
        );
        assert_eq!(
            configured_update_repo(Some("other/Boost-bot"), Some("owner/Boost-bot")),
            "other/Boost-bot"
        );
    }

    #[test]
    fn update_repository_rejects_missing_or_malformed_sources() {
        assert!(validate_update_repo("owner/Boost-bot").is_ok());
        for repo in [
            "",
            "Boost-bot",
            "owner/",
            "/Boost-bot",
            "a/b/c",
            "https://github.com/a/b",
            "owner/..",
            "owner/repo?query",
            "owner/repo#fragment",
        ] {
            assert!(validate_update_repo(repo).is_err(), "accepted {repo}");
        }
    }

    /// 函数 `prerelease_channel_defaults_to_stable_latest`
    ///
    ///
    /// 时间: 2026-04-02
    ///
    /// # 参数
    /// 无
    ///
    /// # 返回
    /// 无
    #[test]
    fn prerelease_channel_defaults_to_stable_latest() {
        let stable = Version::parse("0.1.8").expect("stable version");
        let beta = Version::parse("0.1.8-beta.1").expect("beta version");

        assert!(!should_include_prerelease_updates_with_override(
            &stable, None
        ));
        assert!(!should_include_prerelease_updates_with_override(
            &beta, None
        ));
        assert!(should_include_prerelease_updates_with_override(
            &stable,
            Some(true)
        ));
        assert!(!should_include_prerelease_updates_with_override(
            &beta,
            Some(false)
        ));
    }

    /// 函数 `normalize_version_accepts_v_prefix`
    ///
    ///
    /// 时间: 2026-04-02
    ///
    /// # 参数
    /// 无
    ///
    /// # 返回
    /// 无
    #[test]
    fn normalize_version_accepts_v_prefix() {
        let version = normalize_version(" v0.1.8 ").expect("normalized version");
        assert_eq!(version, Version::parse("0.1.8").expect("expected version"));
    }
}
