use super::*;
use std::collections::BTreeSet;
use std::time::Duration;

const MAX_BYTES: u64 = 2 * 1024 * 1024;
const MAX_PAGES: usize = 30;

pub(super) fn models_url(base: &str, provider: &str) -> Result<reqwest::Url, String> {
    let mut url = reqwest::Url::parse(base).map_err(|_| "模型来源地址无效")?;
    let mut path = url.path().trim_end_matches('/');
    for endpoint in [
        "/images/generations",
        "/images/edits",
        "/chat/completions",
        "/responses",
        "/messages",
    ] {
        if let Some(base) = path.strip_suffix(endpoint) {
            path = base;
            break;
        }
    }
    let version = if provider == AGGREGATE_API_PROVIDER_GEMINI {
        "v1beta"
    } else {
        "v1"
    };
    let path = if path.ends_with("/models") {
        path.to_string()
    } else if path.ends_with("/v1beta") || path.ends_with("/v1") || path.ends_with("/v1alpha") {
        format!("{path}/models")
    } else if provider == AGGREGATE_API_PROVIDER_CODEX {
        format!("{path}/models")
    } else {
        format!("{path}/{version}/models")
    };
    url.set_path(&path);
    url.set_query(None);
    url.set_fragment(None);
    Ok(url)
}

pub(super) fn discover(
    client: &reqwest::blocking::Client,
    api: &AggregateApi,
    secret: &str,
    provider: &str,
) -> Result<Vec<String>, String> {
    let gemini = provider == AGGREGATE_API_PROVIDER_GEMINI;
    let base = models_url(&api.url, provider)?;
    let mut cursor: Option<String> = None;
    let mut visited = BTreeSet::new();
    let mut models = BTreeSet::new();
    let started = Instant::now();
    for _ in 0..MAX_PAGES {
        if started.elapsed() >= Duration::from_secs(60) {
            return Err("远端模型读取超时，已取消本次并入".into());
        }
        let mut url = base.clone();
        url.query_pairs_mut()
            .append_pair(if gemini { "pageSize" } else { "limit" }, "100");
        if let Some(cursor) = &cursor {
            url.query_pairs_mut()
                .append_pair(if gemini { "pageToken" } else { "after_id" }, cursor);
        }
        let raw = url.to_string();
        let (_, authenticated) = apply_probe_auth(client.get(&raw), raw, api, secret)?;
        let (mut request, _) =
            apply_probe_auth(client.get(&authenticated), authenticated, api, secret)?;
        if !gemini {
            request = request.header("anthropic-version", "2023-06-01");
        }
        let response = request
            .timeout(Duration::from_secs(20))
            .header("accept", "application/json")
            .send()
            .map_err(|_| "读取远端模型失败，请检查连接或认证".to_string())?;
        if !response.status().is_success() {
            return Err(format!("远端模型列表返回 HTTP {}", response.status()));
        }
        if response.content_length().is_some_and(|len| len > MAX_BYTES) {
            return Err("远端模型列表过大".into());
        }
        let mut body = Vec::new();
        response
            .take(MAX_BYTES + 1)
            .read_to_end(&mut body)
            .map_err(|_| "远端模型响应读取失败")?;
        if body.len() as u64 > MAX_BYTES {
            return Err("远端模型列表过大".into());
        }
        let data: serde_json::Value =
            serde_json::from_slice(&body).map_err(|_| "远端模型列表格式无效")?;
        let rows = data
            .get(if gemini { "models" } else { "data" })
            .and_then(|v| v.as_array())
            .ok_or("远端模型列表缺少模型数组")?;
        for row in rows {
            if gemini
                && !row
                    .get("supportedGenerationMethods")
                    .and_then(|v| v.as_array())
                    .is_some_and(|methods| {
                        methods.iter().any(|v| {
                            matches!(
                                v.as_str(),
                                Some("generateContent" | "streamGenerateContent")
                            )
                        })
                    })
            {
                continue;
            }
            let name = row
                .get(if gemini { "name" } else { "id" })
                .and_then(|v| v.as_str())
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .ok_or("远端模型标识缺失")?;
            models.insert(name.strip_prefix("models/").unwrap_or(name).to_string());
        }
        cursor = if gemini {
            data.get("nextPageToken")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .map(str::to_string)
        } else if data
            .get("has_more")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
        {
            Some(
                data.get("last_id")
                    .and_then(|v| v.as_str())
                    .filter(|s| !s.is_empty())
                    .ok_or("Claude 分页标识缺失")?
                    .to_string(),
            )
        } else {
            None
        };
        let Some(next) = &cursor else {
            return if models.is_empty() {
                Err("远端没有返回可生成内容的模型".into())
            } else {
                Ok(models.into_iter().collect())
            };
        };
        if !visited.insert(next.clone()) {
            return Err("远端模型分页重复，已取消本次并入".into());
        }
    }
    Err("远端模型页数超过限制，已取消本次并入".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn api(url: String, provider: &str) -> AggregateApi {
        AggregateApi {
            id: "test-model-source".into(),
            provider_type: provider.into(),
            supplier_name: None,
            sort: 0,
            url,
            auth_type: "apikey".into(),
            auth_params_json: None,
            action: None,
            model_override: None,
            status: "active".into(),
            created_at: 0,
            updated_at: 0,
            last_test_at: None,
            last_test_status: None,
            last_test_error: None,
            balance_query_enabled: false,
            balance_query_template: None,
            balance_query_base_url: None,
            balance_query_user_id: None,
            balance_query_config_json: None,
            last_balance_at: None,
            last_balance_status: None,
            last_balance_error: None,
            last_balance_json: None,
        }
    }
    #[test]
    fn native_discovery_paginates_uses_provider_auth_and_filters_embedding_models() {
        for provider in ["gemini", "claude"] {
            let gemini = provider == "gemini";
            let server = tiny_http::Server::http("127.0.0.1:0").unwrap();
            let api = api(format!("http://{}", server.server_addr()), provider);
            let handle = std::thread::spawn(move || {
                for page in 0..2 {
                    let req = server
                        .recv_timeout(Duration::from_secs(5))
                        .unwrap()
                        .unwrap();
                    assert!(req.url().starts_with(if gemini {
                        "/v1beta/models?"
                    } else {
                        "/v1/models?"
                    }));
                    assert!(req.headers().iter().any(|h| h.field.equiv(if gemini {
                        "x-goog-api-key"
                    } else {
                        "x-api-key"
                    }) && h.value.as_str() == "test-secret"));
                    if page == 1 {
                        assert!(req.url().contains(if gemini {
                            "pageToken=next"
                        } else {
                            "after_id=next"
                        }));
                    }
                    let body = if gemini {
                        if page == 0 {
                            json!({"models":[{"name":"models/gemini-test","supportedGenerationMethods":["generateContent"]},{"name":"models/embedding-test","supportedGenerationMethods":["embedContent"]}],"nextPageToken":"next"})
                        } else {
                            json!({"models":[{"name":"models/gemini-other","supportedGenerationMethods":["generateContent"]}]})
                        }
                    } else if page == 0 {
                        json!({"data":[{"id":"claude-test"}],"has_more":true,"last_id":"next"})
                    } else {
                        json!({"data":[{"id":"claude-other"}],"has_more":false})
                    };
                    req.respond(tiny_http::Response::from_string(body.to_string()))
                        .unwrap();
                }
            });
            let client = reqwest::blocking::Client::builder()
                .no_proxy()
                .build()
                .unwrap();
            let result = discover(&client, &api, "test-secret", provider).unwrap();
            assert_eq!(result.len(), 2);
            assert!(!result.iter().any(|m| m.contains("embedding")));
            handle.join().unwrap();
        }
    }
    #[test]
    fn failed_later_page_does_not_return_a_partial_model_snapshot() {
        let server = tiny_http::Server::http("127.0.0.1:0").unwrap();
        let api = api(format!("http://{}", server.server_addr()), "gemini");
        let handle = std::thread::spawn(move || {
            for page in 0..2 {
                let req = server
                    .recv_timeout(Duration::from_secs(5))
                    .unwrap()
                    .unwrap();
                let body = if page == 0 {
                    r#"{"models":[{"name":"models/gemini-test","supportedGenerationMethods":["generateContent"]}],"nextPageToken":"next"}"#
                } else {
                    "unavailable"
                };
                req.respond(
                    tiny_http::Response::from_string(body).with_status_code(if page == 0 {
                        200
                    } else {
                        503
                    }),
                )
                .unwrap();
            }
        });
        assert!(discover(
            &reqwest::blocking::Client::builder()
                .no_proxy()
                .build()
                .unwrap(),
            &api,
            "test-secret",
            "gemini"
        )
        .is_err());
        handle.join().unwrap();
    }
    #[test]
    fn native_model_paths_preserve_proxy_prefix_without_duplicate_version() {
        for (base, provider, path) in [
            ("https://example.test", "gemini", "/v1beta/models"),
            ("https://example.test/v1beta", "gemini", "/v1beta/models"),
            (
                "https://example.test/proxy/v1",
                "claude",
                "/proxy/v1/models",
            ),
        ] {
            assert_eq!(models_url(base, provider).unwrap().path(), path);
        }
    }
}
