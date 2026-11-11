use axum::body::Body;
use axum::extract::Request;
use axum::middleware::Next;
use axum::response::Response;
use futures_util::TryStreamExt;

pub(crate) fn is_api_path(path: &str) -> bool {
    path.starts_with("/v1/")
        || path.starts_with("/v1beta/")
        || path.starts_with("/v1alpha/")
        || path.starts_with("/v1internal:")
}

pub(crate) async fn track(request: Request, next: Next) -> Response {
    if !is_api_path(request.uri().path()) {
        return next.run(request).await;
    }
    let active = crate::telemetry::ActiveTransfer::new();
    let (parts, body) = request.into_parts();
    let metered = body
        .into_data_stream()
        .inspect_ok(|bytes| crate::telemetry::record_upload(bytes.len()));
    let response = next
        .run(Request::from_parts(parts, Body::from_stream(metered)))
        .await;
    let (parts, body) = response.into_parts();
    let metered = body.into_data_stream().inspect_ok(move |bytes| {
        let _keep_alive = &active;
        crate::telemetry::record_download(bytes.len());
    });
    Response::from_parts(parts, Body::from_stream(metered))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn counts_api_endpoints_and_excludes_management_polling() {
        for path in [
            "/v1/responses",
            "/v1/chat/completions",
            "/v1/messages",
            "/v1beta/models/gemini:generateContent",
            "/v1internal:streamGenerateContent",
        ] {
            assert!(is_api_path(path));
        }
        for path in ["/rpc", "/api/runtime", "/metrics", "/events/usage-refresh"] {
            assert!(!is_api_path(path));
        }
    }

    #[tokio::test]
    async fn meters_json_and_incremental_sse_without_changing_tools_or_payloads() {
        use axum::body::to_bytes;
        use axum::routing::post;
        use axum::Router;
        use futures_util::StreamExt;
        use std::convert::Infallible;
        use std::time::Duration;
        let (release_tx, release_rx) = tokio::sync::oneshot::channel::<()>();
        let release = std::sync::Arc::new(tokio::sync::Mutex::new(Some(release_rx)));
        let app = Router::new()
            .fallback(post(move |request: Request| {
                let release = release.clone();
                async move {
                    let stream = request.uri().query() == Some("stream=true");
                    let body = to_bytes(request.into_body(), 65536).await.unwrap();
                    if !stream {
                        return Response::new(Body::from(body));
                    }
                    let receiver = release.lock().await.take().unwrap();
                    let chunks = futures_util::stream::once(async {
                        Ok::<_, Infallible>("data: {\"tool_calls\":[{\"name\":\"lookup\"}]}\n\n")
                    })
                    .chain(futures_util::stream::once(async move {
                        let _ = receiver.await;
                        Ok::<_, Infallible>("data: [DONE]\n\n")
                    }));
                    Response::builder()
                        .header("content-type", "text/event-stream")
                        .body(Body::from_stream(chunks))
                        .unwrap()
                }
            }))
            .layer(axum::middleware::from_fn(track));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        let before = crate::telemetry::snapshot();
        let client = reqwest::Client::builder()
            .no_proxy()
            .timeout(Duration::from_secs(5))
            .build()
            .unwrap();
        let payload =
            r#"{"model":"test","tools":[{"type":"function","function":{"name":"lookup"}}]}"#;
        for endpoint in ["/v1/responses", "/v1/chat/completions"] {
            let body = client
                .post(format!("http://{address}{endpoint}"))
                .body(payload)
                .send()
                .await
                .unwrap()
                .text()
                .await
                .unwrap();
            assert_eq!(body, payload);
        }
        let response = client
            .post(format!("http://{address}/v1/responses?stream=true"))
            .body(payload)
            .send()
            .await
            .unwrap();
        let mut stream = response.bytes_stream();
        let first = tokio::time::timeout(Duration::from_secs(2), stream.next())
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        assert!(String::from_utf8_lossy(&first).contains("tool_calls"));
        release_tx.send(()).unwrap();
        let rest = stream.next().await.unwrap().unwrap();
        assert!(String::from_utf8_lossy(&rest).contains("[DONE]"));
        let after = crate::telemetry::snapshot();
        assert!(after.uploaded_bytes >= before.uploaded_bytes + (payload.len() * 3) as u64);
        assert!(
            after.downloaded_bytes
                >= before.downloaded_bytes + (payload.len() * 2 + first.len() + rest.len()) as u64
        );
        server.abort();
    }
}
