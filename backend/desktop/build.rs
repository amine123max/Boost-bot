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
    tauri_build::build()
}
