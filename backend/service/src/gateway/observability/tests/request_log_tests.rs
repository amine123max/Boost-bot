use super::should_write_gateway_error_fallback;

#[test]
fn gateway_error_fallback_matches_cloudflare_and_rate_limit_errors() {
    assert!(should_write_gateway_error_fallback(
        Some(403),
        Some("Cloudflare 安全验证页（title=Just a moment...）"),
    ));
    assert!(should_write_gateway_error_fallback(
        Some(429),
        Some("type=usage_limit_reached The usage limit"),
    ));
    assert!(!should_write_gateway_error_fallback(
        Some(500),
        Some("internal server error"),
    ));
}
