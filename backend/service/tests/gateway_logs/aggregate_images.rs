use super::*;
use boost_core::storage::AggregateApi;

fn seed_image_connection(storage: &Storage, upstream: &str) {
    let now = now_ts();
    seed_model_catalog_models(storage, &["image-platform"]);
    storage
        .insert_aggregate_api(&AggregateApi {
            id: "agg-images".into(),
            provider_type: "codex".into(),
            supplier_name: Some("Image API".into()),
            sort: 0,
            url: format!("http://{upstream}/v1"),
            auth_type: "apikey".into(),
            auth_params_json: None,
            action: Some("/chat/completions".into()),
            model_override: Some("image-upstream".into()),
            status: "active".into(),
            created_at: now,
            updated_at: now,
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
        })
        .unwrap();
    storage
        .upsert_aggregate_api_secret("agg-images", "image-upstream-secret")
        .unwrap();
    storage
        .upsert_model_source_model(&ModelSourceModel {
            source_kind: "aggregate_api".into(),
            source_id: "agg-images".into(),
            upstream_model: "image-platform".into(),
            display_name: None,
            status: "available".into(),
            discovery_kind: "manual".into(),
            last_synced_at: None,
            extra_json: "{}".into(),
            created_at: now,
            updated_at: now,
        })
        .unwrap();
    storage
        .upsert_model_source_mapping(&ModelSourceMapping {
            id: "image-route".into(),
            platform_model_slug: "image-platform".into(),
            source_kind: "aggregate_api".into(),
            source_id: "agg-images".into(),
            upstream_model: "image-platform".into(),
            enabled: true,
            priority: 0,
            weight: 1,
            billing_model_slug: None,
            created_at: now,
            updated_at: now,
        })
        .unwrap();
    storage
        .insert_api_key(&ApiKey {
            id: "image-key".into(),
            name: Some("Images".into()),
            model_slug: None,
            reasoning_effort: None,
            service_tier: None,
            rotation_strategy: "aggregate_api_rotation".into(),
            aggregate_api_id: Some("agg-images".into()),
            account_plan_filter: None,
            aggregate_api_url: None,
            client_type: "codex".into(),
            protocol_type: "openai_compat".into(),
            auth_scheme: "authorization_bearer".into(),
            upstream_base_url: None,
            static_headers_json: None,
            key_hash: hash_platform_key_for_test("image-platform-key"),
            status: "active".into(),
            created_at: now,
            last_used_at: None,
        })
        .unwrap();
}

#[test]
fn aggregate_image_generation_and_edits_preserve_native_paths_and_payloads() {
    let _lock = test_env_guard();
    for edit in [false, true] {
        let dir = new_test_dir("boost-aggregate-images");
        let db = dir.join("boost.db");
        let _db = EnvGuard::set("BOOST_DB_PATH", db.to_str().unwrap());
        let response = r#"{"created":1,"data":[{"b64_json":"aW1hZ2U="}],"usage":{"input_tokens":2,"output_tokens":1,"total_tokens":3}}"#;
        let (upstream, rx, join) =
            start_mock_upstream_once_with_content_type(response, "application/json");
        let storage = Storage::open(&db).unwrap();
        storage.init().unwrap();
        seed_image_connection(&storage, &upstream);
        let server = boost_service::start_one_shot_server().unwrap();
        let (path, body, content_type) = if edit {
            ("/v1/images/edits","--boost-image\r\nContent-Disposition: form-data; name=\"model\"\r\n\r\nimage-platform\r\n--boost-image\r\nContent-Disposition: form-data; name=\"prompt\"\r\n\r\nedit this image\r\n--boost-image\r\nContent-Disposition: form-data; name=\"image\"; filename=\"image.png\"\r\nContent-Type: image/png\r\n\r\nPNG-FILE-CONTENT\r\n--boost-image--\r\n".to_string(),"multipart/form-data; boundary=boost-image")
        } else {
            (
                "/v1/images/generations",
                r#"{"model":"image-platform","prompt":"draw an image","size":"1024x1024","n":1}"#
                    .into(),
                "application/json",
            )
        };
        let (status, output) = post_http_raw(
            &server.addr,
            path,
            &body,
            &[
                ("Content-Type", content_type),
                ("Authorization", "Bearer image-platform-key"),
            ],
        );
        let captured = rx.recv_timeout(Duration::from_secs(5)).unwrap();
        join.join().unwrap();
        assert_eq!(status, 200, "{output}");
        assert_eq!(captured.path, path);
        assert_eq!(
            captured.headers.get("authorization").map(String::as_str),
            Some("Bearer image-upstream-secret")
        );
        let sent = decode_upstream_request_body(&captured);
        if edit {
            let sent = String::from_utf8(sent).unwrap();
            assert!(sent.contains("image-platform"));
            assert!(sent.contains("PNG-FILE-CONTENT"));
            assert!(sent.contains("edit this image"));
            assert_eq!(
                captured.headers.get("content-type").map(String::as_str),
                Some(content_type)
            );
        } else {
            let sent: serde_json::Value = serde_json::from_slice(&sent).unwrap();
            // Explicitly discovered source models retain their IDs over a stale channel override.
            assert_eq!(sent["model"], "image-platform");
            assert_eq!(sent["prompt"], "draw an image");
            assert!(sent.get("tools").is_none());
        }
        assert!(output.contains("aW1hZ2U="));
    }
}

#[test]
fn aggregate_image_stream_preserves_native_image_events() {
    let _lock = test_env_guard();
    let dir = new_test_dir("boost-aggregate-image-stream");
    let db = dir.join("boost.db");
    let _db = EnvGuard::set("BOOST_DB_PATH", db.to_str().unwrap());
    let stream="event: image_generation.partial_image\ndata: {\"type\":\"image_generation.partial_image\",\"b64_json\":\"cGFydA==\"}\n\nevent: image_generation.completed\ndata: {\"type\":\"image_generation.completed\",\"b64_json\":\"aW1hZ2U=\"}\n\n";
    let (upstream, rx, join) =
        start_mock_upstream_once_with_content_type(stream, "text/event-stream");
    let storage = Storage::open(&db).unwrap();
    storage.init().unwrap();
    seed_image_connection(&storage, &upstream);
    let server = boost_service::start_one_shot_server().unwrap();
    let (status, output) = post_http_raw(
        &server.addr,
        "/v1/images/generations",
        r#"{"model":"image-platform","prompt":"draw","stream":true}"#,
        &[
            ("Content-Type", "application/json"),
            ("Authorization", "Bearer image-platform-key"),
        ],
    );
    let captured = rx.recv_timeout(Duration::from_secs(5)).unwrap();
    join.join().unwrap();
    assert_eq!(status, 200, "{output}");
    assert_eq!(captured.path, "/v1/images/generations");
    assert!(output.contains("image_generation.partial_image"));
    assert!(output.contains("image_generation.completed"));
}
