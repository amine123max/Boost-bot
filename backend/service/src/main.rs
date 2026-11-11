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
    boost_service::portable::bootstrap_current_process();
    boost_service::init_logging();
    let configured_addr = std::env::var("BOOST_SERVICE_ADDR")
        .unwrap_or_else(|_| boost_service::default_listener_bind_addr());
    let addr = boost_service::listener_bind_addr(&configured_addr);
    println!("boost-service listening on {addr}");
    if let Err(err) = boost_service::start_server(&addr) {
        eprintln!("service stopped: {err}");
        std::process::exit(1);
    }
}
