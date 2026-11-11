use boost_core::storage::{ModelPriceRule, Storage};

#[derive(Debug, Clone)]
pub(crate) struct ModelPriceMatch {
    pub(crate) provider: String,
    pub(crate) input_price_per_1m: f64,
    pub(crate) cached_input_price_per_1m: f64,
    pub(crate) output_price_per_1m: f64,
    pub(crate) reasoning_output_price_per_1m: f64,
}

#[derive(Debug, Clone)]
pub(crate) struct CostEstimate {
    pub(crate) provider: Option<String>,
    pub(crate) cost_usd: Option<f64>,
    pub(crate) price_status: &'static str,
}

pub(crate) fn remove_builtin_price_rules(storage: &Storage) -> Result<(), String> {
    storage
        .delete_builtin_model_price_rules()
        .map_err(|err| format!("移除内置价格失败：{err}"))
}

pub(crate) fn load_enabled_price_rules(storage: &Storage) -> Result<Vec<ModelPriceRule>, String> {
    remove_builtin_price_rules(storage)?;
    storage
        .list_enabled_model_price_rules()
        .map_err(|err| format!("list enabled model price rules failed: {err}"))
}

pub(crate) fn wildcard_matches(pattern: &str, value: &str) -> bool {
    if pattern == "*" {
        return true;
    }
    if !pattern.contains('*') {
        return pattern == value;
    }

    let mut remainder = value;
    let mut first = true;
    for part in pattern.split('*').filter(|part| !part.is_empty()) {
        if first && !pattern.starts_with('*') {
            let Some(stripped) = remainder.strip_prefix(part) else {
                return false;
            };
            remainder = stripped;
            first = false;
            continue;
        }
        first = false;
        let Some(index) = remainder.find(part) else {
            return false;
        };
        remainder = &remainder[index + part.len()..];
    }

    pattern.ends_with('*') || remainder.is_empty()
}

fn rule_matches(rule: &ModelPriceRule, normalized_model: &str) -> bool {
    let pattern = rule.model_pattern.trim().to_ascii_lowercase();
    if pattern.is_empty() {
        return false;
    }
    if rule.source == "official_sync" {
        // Website rows identify specific models. Do not price a future version or
        // Codex/Pro variant using a shorter, unrelated model row.
        return normalized_model == pattern
            || normalized_model
                .strip_prefix(&format!("{pattern}-"))
                .is_some_and(|suffix| {
                    (suffix.len() == 8 && suffix.chars().all(|c| c.is_ascii_digit()))
                        || (suffix.len() == 10
                            && suffix.as_bytes().get(4) == Some(&b'-')
                            && suffix.as_bytes().get(7) == Some(&b'-')
                            && suffix
                                .chars()
                                .enumerate()
                                .all(|(i, c)| matches!(i, 4 | 7) || c.is_ascii_digit()))
                });
    }
    match rule.match_type.trim().to_ascii_lowercase().as_str() {
        "exact" => normalized_model == pattern,
        "glob" | "wildcard" => wildcard_matches(&pattern, normalized_model),
        "prefix" | "" => normalized_model.starts_with(&pattern),
        _ => normalized_model.starts_with(&pattern),
    }
}

fn normalize_model_spelling(model: &str) -> String {
    let segment = model.trim().rsplit('/').next().unwrap_or_default();
    let mut normalized = segment
        .to_ascii_lowercase()
        .replace('_', "-")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join("-");
    while normalized.contains("--") {
        normalized = normalized.replace("--", "-");
    }
    normalized
}

fn normalize_model_rule_candidate(model: &str) -> String {
    let mut normalized = model
        .trim()
        .to_ascii_lowercase()
        .replace('_', "-")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join("-");
    while normalized.contains("--") {
        normalized = normalized.replace("--", "-");
    }
    normalized
}

fn canonical_model_for_pricing(model: &str) -> String {
    let normalized = normalize_model_spelling(model);
    if normalized == "gpt-6" {
        "gpt-6-astra".to_string()
    } else {
        normalized
    }
}

fn price_from_rule(rule: &ModelPriceRule, input_tokens: i64) -> Option<ModelPriceMatch> {
    if !rule.enabled
        || !rule.currency.eq_ignore_ascii_case("USD")
        || !rule.unit.eq_ignore_ascii_case("per_1m_tokens")
    {
        return None;
    }

    let mut input = rule.input_price_per_1m?;
    let mut cached = rule
        .cached_input_price_per_1m
        .or(rule.cache_hit_price_per_1m)
        .unwrap_or(input);
    let mut output = rule.output_price_per_1m?;

    if rule
        .long_context_threshold_tokens
        .is_some_and(|threshold| input_tokens > threshold)
    {
        if rule.source == "official_sync" && rule.long_context_input_price_per_1m.is_none() {
            return None;
        }
        input = rule.long_context_input_price_per_1m.unwrap_or(input);
        cached = rule.long_context_cached_input_price_per_1m.unwrap_or(input);
        output = rule.long_context_output_price_per_1m.unwrap_or(output);
    }

    Some(ModelPriceMatch {
        provider: rule.provider.clone(),
        input_price_per_1m: input,
        cached_input_price_per_1m: cached,
        output_price_per_1m: output,
        reasoning_output_price_per_1m: rule.reasoning_output_price_per_1m.unwrap_or(output),
    })
}

pub(crate) fn resolve_model_price_from_rules(
    rules: &[ModelPriceRule],
    model: &str,
    input_tokens: i64,
) -> Option<ModelPriceMatch> {
    matching_price_rule(rules, model, None).and_then(|rule| price_from_rule(rule, input_tokens))
}

fn normalized_service_tier(service_tier: Option<&str>) -> &str {
    match service_tier.map(str::trim).unwrap_or_default() {
        tier if tier.eq_ignore_ascii_case("priority") || tier.eq_ignore_ascii_case("fast") => {
            "fast"
        }
        tier if tier.eq_ignore_ascii_case("flex") => "flex",
        tier if tier.eq_ignore_ascii_case("ultrafast") => "ultrafast",
        _ => "standard",
    }
}

fn matching_price_rule<'a>(
    rules: &'a [ModelPriceRule],
    model: &str,
    service_tier: Option<&str>,
) -> Option<&'a ModelPriceRule> {
    let raw = normalize_model_rule_candidate(model);
    if raw.is_empty() || raw == "unknown" {
        return None;
    }

    let normalized = normalize_model_spelling(model);
    let canonical = canonical_model_for_pricing(model);
    let candidates = [raw.as_str(), normalized.as_str(), canonical.as_str()];
    let tier = normalized_service_tier(service_tier);
    let matched = rules
        .iter()
        .filter(|rule| {
            (rule.billing_mode.is_empty()
                || rule.billing_mode == "standard"
                || rule.billing_mode == tier)
                && candidates
                    .iter()
                    .any(|candidate| rule_matches(rule, candidate))
        })
        .max_by_key(|rule| {
            (
                rule.priority,
                rule.model_pattern.len() as i64,
                rule.billing_mode == tier,
            )
        })?;

    Some(matched)
}

pub(crate) fn resolve_model_price(model: &str, input_tokens: i64) -> Option<ModelPriceMatch> {
    let storage = crate::storage_helpers::open_storage()?;
    remove_builtin_price_rules(&storage).ok()?;
    let rules = storage.list_enabled_model_price_rules().ok()?;
    resolve_model_price_from_rules(&rules, model, input_tokens)
}

fn estimate_cost_from_price(
    price: ModelPriceMatch,
    input_tokens: i64,
    cached_input_tokens: i64,
    output_tokens: i64,
    reasoning_output_tokens: i64,
) -> CostEstimate {
    let input_total = input_tokens.max(0) as f64;
    let cached_input = (cached_input_tokens.max(0) as f64).min(input_total);
    let billable_input = (input_total - cached_input).max(0.0);
    let output_total = output_tokens.max(0) as f64;
    let reasoning_output = (reasoning_output_tokens.max(0) as f64).min(output_total);
    let visible_output = (output_total - reasoning_output).max(0.0);
    let cost = (billable_input / 1_000_000.0) * price.input_price_per_1m
        + (cached_input / 1_000_000.0) * price.cached_input_price_per_1m
        + (visible_output / 1_000_000.0) * price.output_price_per_1m
        + (reasoning_output / 1_000_000.0) * price.reasoning_output_price_per_1m;

    CostEstimate {
        provider: Some(price.provider),
        cost_usd: Some(cost.max(0.0)),
        price_status: "ok",
    }
}

pub(crate) fn estimate_cost_with_rules(
    rules: &[ModelPriceRule],
    model: Option<&str>,
    input_tokens: i64,
    cached_input_tokens: i64,
    output_tokens: i64,
) -> CostEstimate {
    estimate_cost_with_rules_and_reasoning(
        rules,
        model,
        input_tokens,
        cached_input_tokens,
        output_tokens,
        0,
    )
}

pub(crate) fn estimate_cost_with_rules_and_reasoning(
    rules: &[ModelPriceRule],
    model: Option<&str>,
    input_tokens: i64,
    cached_input_tokens: i64,
    output_tokens: i64,
    reasoning_output_tokens: i64,
) -> CostEstimate {
    estimate_cost_with_rules_and_reasoning_for_service_tier(
        rules,
        model,
        input_tokens,
        cached_input_tokens,
        output_tokens,
        reasoning_output_tokens,
        None,
    )
}

pub(crate) fn estimate_cost_with_rules_and_reasoning_for_service_tier(
    rules: &[ModelPriceRule],
    model: Option<&str>,
    input_tokens: i64,
    cached_input_tokens: i64,
    output_tokens: i64,
    reasoning_output_tokens: i64,
    service_tier: Option<&str>,
) -> CostEstimate {
    let Some(model) = model.map(str::trim).filter(|value| !value.is_empty()) else {
        return CostEstimate {
            provider: None,
            cost_usd: None,
            price_status: "missing",
        };
    };

    let matched = matching_price_rule(rules, model, service_tier);
    let selected_price = matched.and_then(|rule| {
        if rule.source == "official_sync"
            && rule.billing_mode != normalized_service_tier(service_tier)
        {
            return None;
        }
        price_from_rule(rule, input_tokens.max(0))
    });
    let Some(price) = selected_price else {
        return CostEstimate {
            provider: None,
            cost_usd: None,
            price_status: "missing",
        };
    };

    estimate_cost_from_price(
        price,
        input_tokens,
        cached_input_tokens,
        output_tokens,
        reasoning_output_tokens,
    )
}

pub(crate) fn estimate_remaining_tokens_from_usd_with_rules(
    rules: &[ModelPriceRule],
    model: &str,
    balance_usd: f64,
) -> Option<i64> {
    if !balance_usd.is_finite() || balance_usd < 0.0 {
        return None;
    }
    let price = resolve_model_price_from_rules(rules, model, 0)?;
    if balance_usd == 0.0 {
        return Some(0);
    }
    let blended_price_per_1m = price.input_price_per_1m * 0.7 + price.output_price_per_1m * 0.3;
    if blended_price_per_1m <= 0.0 {
        return None;
    }
    Some(((balance_usd / blended_price_per_1m) * 1_000_000.0).floor() as i64)
}

pub(crate) fn estimate_cost_usd_for_log(
    storage: &Storage,
    model: Option<&str>,
    input_tokens: Option<i64>,
    cached_input_tokens: Option<i64>,
    output_tokens: Option<i64>,
    reasoning_output_tokens: Option<i64>,
    service_tier: Option<&str>,
) -> f64 {
    let input = input_tokens.unwrap_or(0);
    let cached = cached_input_tokens.unwrap_or(0);
    let output = output_tokens.unwrap_or(0);
    let reasoning = reasoning_output_tokens.unwrap_or(0);
    let _ = remove_builtin_price_rules(storage);
    let rules = storage.list_enabled_model_price_rules().unwrap_or_default();
    let cost = estimate_cost_with_rules_and_reasoning_for_service_tier(
        &rules,
        model,
        input,
        cached,
        output,
        reasoning,
        service_tier,
    );

    cost.cost_usd.unwrap_or(0.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_rule(
        id: &str,
        model_pattern: &str,
        match_type: &str,
        priority: i64,
        input: f64,
        cached: Option<f64>,
        output: f64,
    ) -> ModelPriceRule {
        ModelPriceRule {
            id: id.to_string(),
            provider: "test".to_string(),
            model_pattern: model_pattern.to_string(),
            match_type: match_type.to_string(),
            billing_mode: "standard".to_string(),
            currency: "USD".to_string(),
            unit: "per_1m_tokens".to_string(),
            input_price_per_1m: Some(input),
            cached_input_price_per_1m: cached,
            output_price_per_1m: Some(output),
            reasoning_output_price_per_1m: None,
            cache_write_5m_price_per_1m: None,
            cache_write_1h_price_per_1m: None,
            cache_hit_price_per_1m: None,
            long_context_threshold_tokens: None,
            long_context_input_price_per_1m: None,
            long_context_cached_input_price_per_1m: None,
            long_context_output_price_per_1m: None,
            source: "test".to_string(),
            source_url: None,
            seed_version: None,
            enabled: true,
            priority,
            created_at: 0,
            updated_at: 0,
        }
    }

    fn assert_close(actual: f64, expected: f64) {
        let delta = (actual - expected).abs();
        assert!(
            delta < 0.000_000_1,
            "expected {expected}, got {actual}, delta {delta}"
        );
    }

    #[test]
    fn prices_require_explicit_rules_and_context_boundaries_are_exact() {
        assert!(resolve_model_price_from_rules(&[], "gpt-6.1-terra", 1000).is_none());
        let mut rule = test_rule("test", "test-model", "exact", 15000, 2.0, Some(0.2), 10.0);
        rule.source = "official_sync".into();
        rule.long_context_threshold_tokens = Some(200_000);
        rule.long_context_input_price_per_1m = Some(4.0);
        rule.long_context_output_price_per_1m = Some(15.0);
        rule.long_context_cached_input_price_per_1m = Some(0.4);
        let rules = vec![rule];
        assert_close(
            resolve_model_price_from_rules(&rules, "vendor/test-model-20261110", 200_000)
                .unwrap()
                .input_price_per_1m,
            2.0,
        );
        assert_close(
            resolve_model_price_from_rules(&rules, "test-model-2026-11-10", 200_001)
                .unwrap()
                .input_price_per_1m,
            4.0,
        );
        assert!(resolve_model_price_from_rules(&rules, "test-model-pro", 0).is_none());
        let cost = estimate_cost_with_rules_and_reasoning_for_service_tier(
            &rules,
            Some("test-model"),
            1000,
            200,
            500,
            100,
            None,
        );
        assert_close(cost.cost_usd.unwrap(), 0.00664);
        assert_eq!(
            estimate_cost_with_rules_and_reasoning_for_service_tier(
                &rules,
                Some("test-model"),
                1000,
                0,
                500,
                0,
                Some("fast")
            )
            .price_status,
            "missing"
        );
    }
    #[test]
    fn custom_rules_override_downloads_and_old_builtin_rules_are_removed() {
        let storage = Storage::open_in_memory().unwrap();
        storage.init().unwrap();
        let mut old = test_rule("old", "test-*", "glob", 0, 1.0, None, 2.0);
        old.source = "official_seed".into();
        storage.upsert_model_price_rule(&old).unwrap();
        let mut custom = test_rule("custom", "test-model", "exact", 20000, 9.0, None, 10.0);
        custom.source = "custom".into();
        storage.upsert_model_price_rule(&custom).unwrap();
        let rules = load_enabled_price_rules(&storage).unwrap();
        assert_eq!(rules.len(), 1);
        assert_close(
            resolve_model_price_from_rules(&rules, "test-model", 0)
                .unwrap()
                .input_price_per_1m,
            9.0,
        );
        assert!(wildcard_matches("test-*", "test-other"));
        assert!(!wildcard_matches("test-*", "other-test"));
        assert_eq!(
            estimate_remaining_tokens_from_usd_with_rules(&[], "test-model", 10.0),
            None
        );
    }
}
