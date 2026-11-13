use boost_core::rpc::types::JsonRpcRequest;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::time::Duration;

use super::address::{resolve_service_addr, resolve_socket_addrs};
use super::http::parse_http_body;

const RPC_CONNECT_TIMEOUT: Duration = Duration::from_millis(400);
const RPC_DEFAULT_IO_TIMEOUT: Duration = Duration::from_secs(10);
const RPC_BULK_USAGE_REFRESH_IO_TIMEOUT: Duration = Duration::from_secs(600);
const RPC_QUEUE_WAIT_ALLOWANCE: Duration = Duration::from_secs(65);

enum RpcAttemptError {
    Connect(String),
    Submitted(String),
}

impl From<String> for RpcAttemptError {
    fn from(message: String) -> Self {
        Self::Submitted(message)
    }
}

/// 函数 `rpc_io_timeout`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// - method: 参数 method
/// - params: 参数 params
///
/// # 返回
/// 返回函数执行结果
fn rpc_io_timeout(method: &str, params: Option<&serde_json::Value>) -> Duration {
    rpc_execution_timeout(method, params).saturating_add(RPC_QUEUE_WAIT_ALLOWANCE)
}

fn rpc_execution_timeout(method: &str, params: Option<&serde_json::Value>) -> Duration {
    if matches!(method, "bot/open" | "bot/openDesktop") {
        return Duration::from_secs(60);
    }
    if method == "apikey/modelSourceSync" {
        return Duration::from_secs(180);
    }
    if matches!(
        method,
        "quota/modelPriceRules/syncOpenai" | "quota/modelPriceRules/syncOfficial"
    ) {
        return Duration::from_secs(40);
    }
    if method == "account/usage/refresh"
        && params
            .and_then(|value| value.get("accountId"))
            .and_then(|value| value.as_str())
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .is_none()
    {
        return RPC_BULK_USAGE_REFRESH_IO_TIMEOUT;
    }

    RPC_DEFAULT_IO_TIMEOUT
}

/// 函数 `rpc_call_on_socket`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// - method: 参数 method
/// - addr: 参数 addr
/// - sock: 参数 sock
/// - params: 参数 params
///
/// # 返回
/// 返回函数执行结果
fn rpc_call_on_socket(
    method: &str,
    addr: &str,
    sock: SocketAddr,
    params: Option<serde_json::Value>,
) -> Result<serde_json::Value, RpcAttemptError> {
    let io_timeout = rpc_io_timeout(method, params.as_ref());
    let mut stream = TcpStream::connect_timeout(&sock, RPC_CONNECT_TIMEOUT).map_err(|e| {
        let msg = format!("Failed to connect to service at {addr}: {e}");
        log::warn!(
            "rpc connect failed ({} -> {} via {}): {}",
            method,
            addr,
            sock,
            e
        );
        RpcAttemptError::Connect(msg)
    })?;
    let _ = stream.set_read_timeout(Some(io_timeout));
    let _ = stream.set_write_timeout(Some(io_timeout));

    let req = JsonRpcRequest {
        id: 1.into(),
        method: method.to_string(),
        params,
        trace: None,
    };
    let json = serde_json::to_string(&req).map_err(|e| e.to_string())?;
    let rpc_token = boost_service::rpc_auth_token();
    let http = format!(
        "POST /rpc HTTP/1.1\r\nHost: {addr}\r\nContent-Type: application/json\r\nX-Boost-Rpc-Token: {rpc_token}\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{}",
        json.len(),
        json
    );
    stream.write_all(http.as_bytes()).map_err(|e| {
        let msg = e.to_string();
        log::warn!(
            "rpc write failed ({} -> {} via {}): {}",
            method,
            addr,
            sock,
            msg
        );
        msg
    })?;

    let mut buf = String::new();
    stream.read_to_string(&mut buf).map_err(|e| {
        let msg = e.to_string();
        log::warn!(
            "rpc read failed ({} -> {} via {}): {}",
            method,
            addr,
            sock,
            msg
        );
        msg
    })?;
    let body = parse_http_body(&buf).map_err(|msg| {
        log::warn!(
            "rpc parse failed ({} -> {} via {}): {}",
            method,
            addr,
            sock,
            msg
        );
        msg
    })?;
    if body.trim().is_empty() {
        log::warn!("rpc empty response ({} -> {} via {})", method, addr, sock);
        return Err(
            "Empty response from service (service not ready, exited, or port occupied)"
                .to_string()
                .into(),
        );
    }

    let v: serde_json::Value = serde_json::from_str(&body).map_err(|e| {
        let msg = format!("Unexpected RPC response (non-JSON body): {e}");
        log::warn!(
            "rpc json parse failed ({} -> {} via {}): {}",
            method,
            addr,
            sock,
            msg
        );
        msg
    })?;
    if let Some(err) = v.get("error") {
        log::warn!("rpc error ({} -> {} via {}): {}", method, addr, sock, err);
    }
    Ok(v)
}

/// 函数 `rpc_call_with_sockets`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// - crate: 参数 crate
///
/// # 返回
/// 返回函数执行结果
pub(crate) fn rpc_call_with_sockets(
    method: &str,
    addr: &str,
    socket_addrs: &[SocketAddr],
    params: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    if socket_addrs.is_empty() {
        return Err(format!(
            "Invalid service address {addr}: no address resolved"
        ));
    }
    let mut last_err =
        "Empty response from service (service not ready, exited, or port occupied)".to_string();
    for attempt in 0..=1 {
        for sock in socket_addrs {
            match rpc_call_on_socket(method, addr, *sock, params.clone()) {
                Ok(v) => return Ok(v),
                Err(RpcAttemptError::Connect(err)) => last_err = err,
                // Once connected, a queued mutation may already have executed.
                // Do not resubmit it to another address after a read/write failure.
                Err(RpcAttemptError::Submitted(err)) => return Err(err),
            }
        }
        if attempt == 0 {
            std::thread::sleep(Duration::from_millis(120));
        }
    }
    Err(last_err)
}

/// 函数 `rpc_call`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// - crate: 参数 crate
///
/// # 返回
/// 返回函数执行结果
pub(crate) fn rpc_call(
    method: &str,
    addr: Option<String>,
    params: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let addr = resolve_service_addr(addr)?;
    let socket_addrs = resolve_socket_addrs(&addr)?;
    rpc_call_with_sockets(method, &addr, &socket_addrs, params)
}

#[cfg(test)]
mod tests {
    use super::{
        rpc_io_timeout, RPC_BULK_USAGE_REFRESH_IO_TIMEOUT, RPC_DEFAULT_IO_TIMEOUT,
        RPC_QUEUE_WAIT_ALLOWANCE,
    };

    #[test]
    fn submitted_mutation_is_not_replayed_after_a_broken_response() {
        use std::io::{Read, Write};
        use std::net::TcpListener;
        use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let address = listener.local_addr().unwrap();
        let calls = AtomicUsize::new(0);
        let done = AtomicBool::new(false);
        std::thread::scope(|scope| {
            scope.spawn(|| {
                while !done.load(Ordering::SeqCst) {
                    match listener.accept() {
                        Ok((mut stream, _)) => {
                            calls.fetch_add(1, Ordering::SeqCst);
                            stream.set_read_timeout(Some(std::time::Duration::from_secs(2))).unwrap();
                            let mut buffer = [0; 8192];
                            let _ = stream.read(&mut buffer);
                            let _ = stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 1\r\nConnection: close\r\n\r\n!");
                        }
                        Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                            std::thread::sleep(std::time::Duration::from_millis(1));
                        }
                        Err(error) => panic!("mock listener: {error}"),
                    }
                }
            });
            let result = super::rpc_call_with_sockets(
                "account/usage/resetQuota",
                &address.to_string(),
                &[address, address],
                None,
            );
            done.store(true, Ordering::SeqCst);
            assert!(result.is_err());
        });
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn official_price_sync_allows_the_upstream_download_timeout() {
        assert!(
            rpc_io_timeout("quota/modelPriceRules/syncOpenai", None)
                >= std::time::Duration::from_secs(40)
        );
    }

    /// 函数 `bulk_usage_refresh_uses_extended_timeout`
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
    fn bulk_usage_refresh_uses_extended_timeout() {
        let timeout = rpc_io_timeout("account/usage/refresh", None);
        assert_eq!(
            timeout,
            RPC_BULK_USAGE_REFRESH_IO_TIMEOUT + RPC_QUEUE_WAIT_ALLOWANCE
        );
    }

    /// 函数 `single_usage_refresh_keeps_default_timeout`
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
    fn single_usage_refresh_keeps_default_timeout() {
        let timeout = rpc_io_timeout(
            "account/usage/refresh",
            Some(&serde_json::json!({ "accountId": "acc-1" })),
        );
        assert_eq!(timeout, RPC_DEFAULT_IO_TIMEOUT + RPC_QUEUE_WAIT_ALLOWANCE);
    }

    /// 函数 `unrelated_rpc_keeps_default_timeout`
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
    fn unrelated_rpc_keeps_default_timeout() {
        let timeout = rpc_io_timeout("account/list", None);
        assert_eq!(timeout, RPC_DEFAULT_IO_TIMEOUT + RPC_QUEUE_WAIT_ALLOWANCE);
    }
}
