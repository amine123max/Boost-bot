use axum::body::{to_bytes, Body};
use axum::extract::Request;
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use std::sync::OnceLock;

pub(crate) async fn proxy(request: Request) -> Response {
    let (parts, body) = request.into_parts();
    let token_ok = parts
        .headers
        .get("x-boost-rpc-token")
        .and_then(|v| v.to_str().ok())
        .is_some_and(crate::rpc_auth_token_matches);
    if !token_ok {
        return (StatusCode::UNAUTHORIZED, "Boost authentication required").into_response();
    }
    let actor = crate::RpcActor::from_parts(
        parts
            .headers
            .get("x-boost-rpc-actor-role")
            .and_then(|v| v.to_str().ok()),
        parts
            .headers
            .get("x-boost-rpc-actor-user-id")
            .and_then(|v| v.to_str().ok()),
    );
    let endpoint = match tokio::task::spawn_blocking(move || super::ensure_host(&actor)).await {
        Ok(Ok(endpoint)) => endpoint,
        Ok(Err(error)) => return (StatusCode::SERVICE_UNAVAILABLE, error).into_response(),
        Err(_) => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                "Boost Bot host unavailable",
            )
                .into_response()
        }
    };
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    let client = CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .expect("valid local client")
    });
    let path = parts
        .uri
        .path_and_query()
        .map(|v| v.as_str())
        .unwrap_or("/boost-bot/");
    let target = format!("http://127.0.0.1:{}{path}", endpoint.port);
    let body = match to_bytes(body, 64 * 1024 * 1024).await {
        Ok(body) => body,
        Err(_) => return (StatusCode::PAYLOAD_TOO_LARGE, "Bot request too large").into_response(),
    };
    let mut outbound = client
        .request(parts.method, target)
        .header("x-amb-token", endpoint.token)
        .body(body);
    for name in [
        "content-type", "accept", "range", "x-amb-lang",
        "x-signature-ed25519", "x-signature-timestamp", "x-bot-appid",
    ] {
        if let Some(value) = parts.headers.get(name) {
            outbound = outbound.header(name, value);
        }
    }
    let upstream = match outbound.send().await {
        Ok(upstream) => upstream,
        Err(_) => return (StatusCode::BAD_GATEWAY, "Boost Bot connection failed").into_response(),
    };
    let status = upstream.status();
    let headers = upstream.headers().clone();
    let mut response = Response::new(Body::from_stream(upstream.bytes_stream()));
    *response.status_mut() = status;
    for name in [
        "content-type",
        "content-disposition",
        "content-range",
        "accept-ranges",
        "location",
        "content-security-policy",
        "x-content-type-options",
        "access-control-allow-origin",
        "cross-origin-resource-policy",
    ] {
        if let Some(value) = headers.get(name) {
            response
                .headers_mut()
                .insert(header::HeaderName::from_static(name), value.clone());
        }
    }
    response.headers_mut().insert(
        header::CACHE_CONTROL,
        header::HeaderValue::from_static("no-store"),
    );
    response
        .headers_mut()
        .insert("x-accel-buffering", header::HeaderValue::from_static("no"));
    response
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bot_documents_assets_and_streams_require_rpc_authentication() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        runtime.block_on(async {
            for path in [
                "/boost-bot/",
                "/boost-bot/amb/static/main.js",
                "/boost-bot/amb/api/bots/default/chat/stream",
                "/boost-bot/amb/hooks/qq/acct_example",
            ] {
                let request = axum::http::Request::builder()
                    .uri(path)
                    .body(Body::empty())
                    .unwrap();
                assert_eq!(proxy(request).await.status(), StatusCode::UNAUTHORIZED);
            }
        });
    }
}
