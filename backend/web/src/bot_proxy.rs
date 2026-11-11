//! Keep every Bot request, including assets and SSE, behind the Boost Web session.
use super::*;

pub(super) async fn proxy(State(state): State<Arc<AppState>>, request: Request) -> Response {
    let (parts, body) = request.into_parts();
    let path = parts
        .uri
        .path_and_query()
        .map(|p| p.as_str())
        .unwrap_or("/boost-bot/");
    let mut outbound = state
        .client
        .request(parts.method, format!("http://{}{path}", state.service_addr))
        .header("x-boost-rpc-token", &state.rpc_token)
        .body(reqwest::Body::wrap_stream(body.into_data_stream()));
    // Never forward caller-supplied RPC actor, RPC token, host or runtime cookies.
    if let Some(session) = auth::current_app_session_from_headers(&parts.headers) {
        outbound = outbound
            .header("x-boost-rpc-actor-role", session.user.role)
            .header("x-boost-rpc-actor-user-id", session.user.id);
    }
    for name in ["content-type", "accept", "range", "x-amb-lang"] {
        if let Some(value) = parts.headers.get(name) {
            outbound = outbound.header(name, value);
        }
    }
    let upstream = match outbound.send().await {
        Ok(response) => response,
        Err(_) => return (StatusCode::BAD_GATEWAY, "Boost Bot 服务连接失败").into_response(),
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
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response
        .headers_mut()
        .insert("x-accel-buffering", HeaderValue::from_static("no"));
    response
}
