use boost_core::storage::ModelPriceRule;
use chrono::NaiveDate;
use serde::Deserialize;
use serde_json::Value;

pub(super) const SOURCE_URL: &str = "https://tokenrhythm.studio/models";
pub(super) const FX_URL: &str = "https://api.frankfurter.dev/v1/latest?base=CNY&symbols=USD";
const MODELS: [&str; 3] = [
    "deepseek-v4.1-flash-1017",
    "deepseek-v4-pro-0813",
    "glm-5.3-flashx",
];

#[derive(Deserialize)]
struct ExchangeQuote {
    amount: f64,
    base: String,
    date: String,
    rates: UsdRate,
}

#[derive(Deserialize)]
struct UsdRate {
    #[serde(rename = "USD")]
    usd: f64,
}

fn number(value: Option<&Value>) -> Result<Option<f64>, String> {
    let Some(value) = value.filter(|v| !v.is_null()) else {
        return Ok(None);
    };
    let amount = value
        .as_f64()
        .or_else(|| value.as_str()?.parse().ok())
        .filter(|n| n.is_finite() && (0.0..=100_000.0).contains(n))
        .ok_or("TokenRhythm单价格式无效，已保留现有价格")?;
    Ok(Some(amount))
}

/// Both network documents must validate before the caller replaces any stored rules.
pub(super) fn parse(
    document: &str,
    fx_document: &str,
    timestamp: i64,
) -> Result<Vec<ModelPriceRule>, String> {
    let quote: ExchangeQuote =
        serde_json::from_str(fx_document).map_err(|_| "汇率响应格式变化，已保留现有价格")?;
    let today = chrono::DateTime::from_timestamp(timestamp, 0)
        .ok_or("无效的同步时间")?
        .date_naive();
    let date = NaiveDate::parse_from_str(&quote.date, "%Y-%m-%d").map_err(|_| "汇率日期无效")?;
    let age = (today - date).num_days();
    if quote.base != "CNY"
        || quote.amount != 1.0
        || !quote.rates.usd.is_finite()
        || !(0.01..=10.0).contains(&quote.rates.usd)
        || !(0..=7).contains(&age)
    {
        return Err("人民币兑美元汇率无效或过期，已保留现有价格".into());
    }
    let scripts =
        regex::Regex::new(r#"(?s)<script\b[^>]*type=["']application/json["'][^>]*>(.*?)</script>"#)
            .expect("static JSON script pattern");
    let snapshots: Vec<Value> = scripts
        .captures_iter(document)
        .filter_map(|capture| serde_json::from_str(&capture[1]).ok())
        .collect();
    let matching = snapshots
        .iter()
        .filter_map(|v| v.get("queries").and_then(Value::as_array))
        .flatten()
        .filter(|q| q.get("queryKey") == Some(&serde_json::json!(["public", "models"])))
        .collect::<Vec<_>>();
    if matching.len() != 1 {
        return Err("TokenRhythm模型目录格式变化，已保留现有价格".into());
    }
    let rows = matching[0]
        .pointer("/state/data")
        .and_then(Value::as_array)
        .ok_or("TokenRhythm模型目录为空，已保留现有价格")?;
    let mut rules = Vec::new();
    for model in MODELS {
        let selected: Vec<_> = rows
            .iter()
            .filter(|row| row.get("id").and_then(Value::as_str) == Some(model))
            .collect();
        if selected.len() != 1 {
            return Err(format!("TokenRhythm模型{model}缺失或重复，已保留现有价格"));
        }
        let row = selected[0];
        if row.get("currency").and_then(Value::as_str) != Some("CNY")
            || row.get("billingMode").and_then(Value::as_str) != Some("per_1m_tokens")
            || row.get("billingUnit").and_then(Value::as_u64) != Some(1_000_000)
        {
            return Err(format!(
                "TokenRhythm模型{model}币种或计价单位变化，已保留现有价格"
            ));
        }
        let price = |effective: &str, base: &str| -> Result<Option<f64>, String> {
            Ok(number(
                row.get(effective)
                    .filter(|v| !v.is_null())
                    .or_else(|| row.get(base)),
            )?
            .map(|v| v * quote.rates.usd))
        };
        let input = price("effectiveInputPrice", "inputPrice")?.ok_or("缺少TokenRhythm输入单价")?;
        let output =
            price("effectiveOutputPrice", "outputPrice")?.ok_or("缺少TokenRhythm输出单价")?;
        let cached = price("effectiveCacheReadPrice", "cacheReadPrice")?;
        rules.push(ModelPriceRule {
            id: format!("tokenrhythm-sync-standard-{model}"),
            provider: "tokenrhythm".into(),
            model_pattern: model.into(),
            match_type: "exact".into(),
            billing_mode: "standard".into(),
            currency: "USD".into(),
            unit: "per_1m_tokens".into(),
            input_price_per_1m: Some(input),
            cached_input_price_per_1m: cached,
            output_price_per_1m: Some(output),
            reasoning_output_price_per_1m: None,
            cache_write_5m_price_per_1m: None,
            cache_write_1h_price_per_1m: None,
            cache_hit_price_per_1m: cached,
            long_context_threshold_tokens: None,
            long_context_input_price_per_1m: None,
            long_context_cached_input_price_per_1m: None,
            long_context_output_price_per_1m: None,
            source: "official_sync".into(),
            source_url: Some(SOURCE_URL.into()),
            // Snapshot provenance travels with the converted rules across restarts.
            seed_version: Some(format!(
                "CNY→USD · 1 CNY = {} USD · 汇率 {} · Frankfurter/ECB",
                quote.rates.usd, quote.date
            )),
            enabled: true,
            priority: 15_000,
            created_at: timestamp,
            updated_at: timestamp,
        });
    }
    Ok(rules)
}

#[cfg(test)]
mod tests {
    use super::*;
    const TIME: i64 = 1_794_643_200; // 2026-11-14 UTC
    const FX: &str = r#"{"amount":1,"base":"CNY","date":"2026-11-13","rates":{"USD":0.14988}}"#;
    fn document() -> String {
        let rows: Vec<Value> = MODELS.iter().map(|id| serde_json::json!({
            "id": id, "currency": "CNY", "billingMode":"per_1m_tokens", "billingUnit":1_000_000,
            "inputPrice":"4.5", "effectiveInputPrice":"2", "outputPrice":"7", "cacheReadPrice":"0.57"
        })).collect();
        format!(
            r#"<script id="state" type="application/json">{}</script>"#,
            serde_json::json!({"queries":[{"queryKey":["public","models"],"state":{"data":rows}}]})
        )
    }
    #[test]
    fn converts_effective_price_and_records_latest_business_day() {
        let rules = parse(&document(), FX, TIME).unwrap();
        assert_eq!(rules.len(), 3);
        let rule = &rules[0];
        assert!((rule.input_price_per_1m.unwrap() - 0.29976).abs() < 1e-10);
        assert!((rule.cached_input_price_per_1m.unwrap() - 0.0854316).abs() < 1e-10);
        assert!((rule.output_price_per_1m.unwrap() - 1.04916).abs() < 1e-10);
        assert!(rule.seed_version.as_ref().unwrap().contains("2026-11-13"));
        assert!(
            super::super::model_pricing::resolve_model_price_from_rules(&rules, MODELS[0], 0)
                .is_some()
        );
        assert!(super::super::model_pricing::resolve_model_price_from_rules(
            &rules,
            &format!("{}-20261114", MODELS[0]),
            0
        )
        .is_none());
    }
    #[test]
    fn rejects_incomplete_snapshot_currency_units_and_bad_prices() {
        let doc = document();
        for invalid in [
            doc.replace(MODELS[0], "other-model"),
            doc.replace("CNY", "USD"),
            doc.replace("1000000", "1000"),
            doc.replace("\"2\"", "\"-2\""),
            doc.replace("application/json", "text/plain"),
        ] {
            assert!(parse(&invalid, FX, TIME).is_err());
        }
    }
    #[test]
    fn rejects_wrong_direction_stale_future_and_zero_fx() {
        for fx in [
            FX.replace("CNY", "USD"),
            FX.replace("2026-11-13", "2026-11-01"),
            FX.replace("2026-11-13", "2026-11-15"),
            FX.replace("0.14988", "0"),
        ] {
            assert!(parse(&document(), &fx, TIME).is_err());
        }
    }
    #[test]
    fn replacement_is_atomic_and_preserves_custom_and_other_provider_rules() {
        let storage = boost_core::storage::Storage::open_in_memory().unwrap();
        storage.init().unwrap();
        let rules = parse(&document(), FX, TIME).unwrap();
        let mut custom = rules[0].clone();
        custom.id = "custom-price".into();
        custom.source = "custom".into();
        custom.priority = 20_000;
        let mut other = rules[0].clone();
        other.id = "other-provider".into();
        other.provider = "openai".into();
        storage.upsert_model_price_rule(&custom).unwrap();
        storage.upsert_model_price_rule(&other).unwrap();
        storage
            .replace_synced_model_price_rules("tokenrhythm", &rules)
            .unwrap();
        assert_eq!(storage.list_model_price_rules().unwrap().len(), 5);
        assert!(storage
            .replace_synced_model_price_rules("tokenrhythm", &[])
            .is_err());
        let mut collision = rules.clone();
        collision[0].id = custom.id.clone();
        assert!(storage
            .replace_synced_model_price_rules("tokenrhythm", &collision)
            .is_err());
        let stored = storage.list_model_price_rules().unwrap();
        assert_eq!(stored.len(), 5);
        assert_eq!(
            stored.iter().find(|r| r.id == custom.id).unwrap().source,
            "custom"
        );
        assert_eq!(
            stored.iter().find(|r| r.id == other.id).unwrap().provider,
            "openai"
        );
    }
}
