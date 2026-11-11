/// 函数 `main`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// 无
///
/// # 返回
/// 无
fn main() {
    println!("cargo:rerun-if-env-changed=BOOST_UPDATE_REPO");
    println!("cargo:rerun-if-env-changed=BOOST_EMBEDDED_BOT_ARCHIVE");
    println!("cargo:rerun-if-env-changed=BOOST_EMBEDDED_BOT_DIGEST");
    if std::env::var_os("CARGO_FEATURE_PORTABLE_RUNTIME").is_some() {
        let archive = std::env::var("BOOST_EMBEDDED_BOT_ARCHIVE")
            .expect("Build the portable EXE with scripts/package-portable.py");
        let archive = std::fs::canonicalize(archive).expect("Embedded Bot archive is missing");
        let digest = std::env::var("BOOST_EMBEDDED_BOT_DIGEST")
            .expect("Embedded Bot archive digest is missing");
        assert!(digest.len() == 64 && digest.bytes().all(|byte| byte.is_ascii_hexdigit()));
        println!("cargo:rerun-if-changed={}", archive.display());
        println!(
            "cargo:rustc-env=BOOST_EMBEDDED_BOT_ARCHIVE={}",
            archive.display()
        );
        println!("cargo:rustc-env=BOOST_EMBEDDED_BOT_DIGEST={digest}");
    }
    tauri_build::build()
}
