use boost_core::storage::ModelPriceRule;
use regex::Regex;
use std::collections::BTreeMap;

pub(super) const CLAUDE_URL: &str = "https://platform.claude.com/docs/en/about-claude/pricing.md";
pub(super) const CLAUDE_SOURCE: &str = "https://platform.claude.com/docs/en/about-claude/pricing";
pub(super) const GEMINI_URL: &str = "https://aistudio.google.com/docs/pricing";
pub(super) const GEMINI_SOURCE: &str = "https://ai.google.dev/gemini-api/docs/pricing";

fn regex(pattern: &str) -> Regex {
    Regex::new(pattern).expect("static pricing expression")
}
fn usd(text: &str) -> Result<f64, String> {
    let capture = regex(r"\$([0-9]+(?:\.[0-9]+)?)")
        .captures(text)
        .ok_or_else(|| format!("官方价格格式变化：{text}"))?;
    let value = capture[1].parse::<f64>().map_err(|_| "官方金额无效")?;
    if !value.is_finite() || !(0.0..=100_000.0).contains(&value) {
        return Err("官方金额超出范围".into());
    }
    Ok(value)
}
fn threshold(text: &str) -> Option<i64> {
    let expression = regex(r"(?i)(?:<=|≤|>|up to|over)\s*([0-9][0-9,]*)([km]?)");
    let capture = expression.captures(text)?;
    let base = capture[1].replace(',', "").parse::<i64>().ok()?;
    Some(
        base * match capture
            .get(2)
            .map(|m| m.as_str().to_ascii_lowercase())
            .as_deref()
        {
            Some("k") => 1000,
            Some("m") => 1_000_000,
            _ => 1,
        },
    )
}
fn rule(
    provider: &str,
    model: &str,
    input: f64,
    cache: Option<f64>,
    output: f64,
    source: &str,
    at: i64,
) -> ModelPriceRule {
    ModelPriceRule {
        id: format!("{provider}-sync-standard-{model}"),
        provider: provider.into(),
        model_pattern: model.into(),
        match_type: "exact".into(),
        billing_mode: "standard".into(),
        currency: "USD".into(),
        unit: "per_1m_tokens".into(),
        input_price_per_1m: Some(input),
        cached_input_price_per_1m: cache,
        output_price_per_1m: Some(output),
        reasoning_output_price_per_1m: None,
        cache_write_5m_price_per_1m: None,
        cache_write_1h_price_per_1m: None,
        cache_hit_price_per_1m: cache,
        long_context_threshold_tokens: None,
        long_context_input_price_per_1m: None,
        long_context_cached_input_price_per_1m: None,
        long_context_output_price_per_1m: None,
        source: "official_sync".into(),
        source_url: Some(source.into()),
        seed_version: None,
        enabled: true,
        priority: 15_000,
        created_at: at,
        updated_at: at,
    }
}

pub(super) fn claude(document: &str, at: i64) -> Result<Vec<ModelPriceRule>, String> {
    let section = document
        .split("## Model pricing")
        .nth(1)
        .and_then(|s| s.split("\n## ").next())
        .ok_or("未找到 Claude 官方模型价格表")?;
    if !section.contains("Base input tokens") || !section.contains("Cache hits and refreshes") {
        return Err("Claude 官方价格表列发生变化".into());
    }
    let mut rules: BTreeMap<String, ModelPriceRule> = BTreeMap::new();
    for line in section
        .lines()
        .map(str::trim)
        .filter(|line| line.starts_with("| Claude "))
    {
        let cells: Vec<_> = line.trim_matches('|').split('|').map(str::trim).collect();
        if cells.len() != 6 {
            return Err("Claude 官方价格表列数异常".into());
        }
        if cells[0].contains("retired") {
            continue;
        }
        let label = cells[0].split('(').next().unwrap().trim();
        let model = label
            .to_ascii_lowercase()
            .split_whitespace()
            .collect::<Vec<_>>()
            .join("-");
        if !model.starts_with("claude-") {
            return Err("Claude 模型名称无效".into());
        }
        let mut item = rule(
            "anthropic",
            &model,
            usd(cells[1])?,
            Some(usd(cells[4])?),
            usd(cells[5])?,
            CLAUDE_SOURCE,
            at,
        );
        item.cache_write_5m_price_per_1m = Some(usd(cells[2])?);
        item.cache_write_1h_price_per_1m = Some(usd(cells[3])?);
        if cells[0].contains("for prompts over") {
            let existing = rules
                .get_mut(&model)
                .ok_or("Claude 长上下文价格缺少基础价格")?;
            existing.long_context_threshold_tokens =
                Some(threshold(cells[0]).ok_or("Claude 上下文阈值无法识别")?);
            existing.long_context_input_price_per_1m = item.input_price_per_1m;
            existing.long_context_cached_input_price_per_1m = item.cached_input_price_per_1m;
            existing.long_context_output_price_per_1m = item.output_price_per_1m;
        } else if rules.insert(model, item).is_some() {
            return Err("Claude 官方价格含重复模型".into());
        }
    }
    if rules.is_empty() {
        return Err("Claude 官方价格表为空".into());
    }
    let mut aliases = Vec::new();
    for item in rules.values() {
        if item.model_pattern.contains('.') {
            let mut alias = item.clone();
            alias.model_pattern = alias.model_pattern.replace('.', "-");
            alias.id = format!("anthropic-sync-standard-{}", alias.model_pattern);
            aliases.push(alias);
        }
    }
    Ok(rules.into_values().chain(aliases).collect())
}

#[derive(Debug)]
struct Rate {
    base: f64,
    long: Option<f64>,
    limit: Option<i64>,
}
fn gemini_rate(cell: &str, at: i64) -> Result<Rate, String> {
    let lines: Vec<_> = cell
        .lines()
        .map(str::trim)
        .filter(|line| {
            line.contains('$')
                && !line.contains("storage price")
                && !line.contains("per hour")
                && !line.contains("(audio)")
        })
        .collect();
    if lines.is_empty() {
        return Err("Gemini 价格缺少文本金额".into());
    }
    let today = chrono::DateTime::from_timestamp(at, 0)
        .ok_or("同步时间无效")?
        .date_naive();
    if lines
        .iter()
        .any(|line| line.contains("through ") || line.contains("starting "))
    {
        let dates = regex(r"([A-Za-z]+ \d{1,2}, \d{4})");
        let mut chosen = None;
        for line in lines {
            let capture = dates.captures(line).ok_or("Gemini 定价生效日期无法识别")?;
            let date = chrono::NaiveDate::parse_from_str(&capture[1], "%B %d, %Y")
                .map_err(|_| "Gemini 日期格式变化")?;
            if line.contains("through ") && today <= date
                || line.contains("starting ") && today >= date
            {
                chosen = Some(usd(line)?);
            }
        }
        return Ok(Rate {
            base: chosen.ok_or("Gemini 未找到当前日期适用的价格")?,
            long: None,
            limit: None,
        });
    }
    let base = usd(lines[0])?;
    let high = lines
        .iter()
        .skip(1)
        .find(|line| line.contains('>') && !line.contains("<="));
    let long = high.map(|line| usd(line)).transpose()?;
    if lines.len() > 1 && long.is_none() {
        return Err("Gemini 存在无法识别的多个文本价格，已保留现有价格".into());
    }
    Ok(Rate {
        base,
        long,
        limit: threshold(lines[0]).or_else(|| high.and_then(|line| threshold(line))),
    })
}
fn gemini_cell<'a>(section: &'a str, label: &str) -> Option<&'a str> {
    let start = section.find(&format!("* {label}"))?;
    let row = &section[start..];
    let end = row
        .find("\n  ---")
        .or_else(|| row.find("{% /table"))
        .unwrap_or(row.len());
    let row = &row[..end];
    let mut bullets = row.match_indices("* ");
    bullets.next()?;
    bullets.next()?;
    let third = bullets.next()?.0 + 2;
    Some(row[third..].trim())
}
pub(super) fn gemini(document: &str, at: i64) -> Result<Vec<ModelPriceRule>, String> {
    let document = document
        .replace("&quot;", "\"")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&");
    let mut rules = Vec::new();
    let id = regex(r"`(gemini-[a-zA-Z0-9.\-]+)`");
    for section in document.split("\n## ").skip(1) {
        let heading = section.lines().next().unwrap_or("").to_ascii_lowercase();
        if !heading.starts_with("gemini ")
            || [
                "image",
                "audio",
                "live",
                "transcribe",
                "embedding",
                "tts",
                "robotics",
                "omni",
            ]
            .iter()
            .any(|word| heading.contains(word))
        {
            continue;
        }
        let Some(standard) = section
            .split("{% tab title=\"Standard\" %}")
            .nth(1)
            .map(|s| s.split("{% /tab %}").next().unwrap_or(s))
        else {
            continue;
        };
        let Some(model) = id.captures(section).map(|c| c[1].to_string()) else {
            continue;
        };
        let Some(input) = gemini_cell(standard, "Input price") else {
            continue;
        };
        let Some(output) = gemini_cell(standard, "Output price") else {
            continue;
        };
        // Image/audio generation has separate billing units which token logs cannot distinguish.
        if output.contains("(images)") || output.contains("(image)") {
            continue;
        }
        let input = gemini_rate(input, at)?;
        let output = gemini_rate(output, at)?;
        if input.long.is_some() != output.long.is_some() {
            return Err(format!("Gemini {model} 长上下文单价不完整"));
        }
        let cache = gemini_cell(standard, "Context caching price")
            .filter(|c| c.contains('$'))
            .map(|c| gemini_rate(c, at))
            .transpose()?;
        let mut item = rule(
            "google",
            &model,
            input.base,
            cache.as_ref().map(|r| r.base),
            output.base,
            GEMINI_SOURCE,
            at,
        );
        if input.long.is_some() {
            item.long_context_threshold_tokens =
                Some(input.limit.ok_or("Gemini 长上下文阈值缺失")?);
            item.long_context_input_price_per_1m = input.long;
            item.long_context_output_price_per_1m = output.long;
            item.long_context_cached_input_price_per_1m = cache.and_then(|r| r.long);
        }
        rules.push(item);
    }
    if rules.is_empty() {
        return Err("未找到 Gemini 官方 Standard 文本价格表".into());
    }
    Ok(rules)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn claude_cache_aliases_and_context_boundary() {
        let doc="## Model pricing\n| Model | Base input tokens | 5m writes | 1h writes | Cache hits and refreshes | Output |\n| Claude Haiku 5.5 (for prompts up to 100,000 tokens) | $0.10 | $0.125 | $0.20 | $0.01 | $0.50 |\n| Claude Haiku 5.5 (for prompts over 100,000 tokens) | $0.50 | $0.625 | $1 | $0.05 | $2.50 |\n## Other\n";
        let rules = claude(doc, 123).unwrap();
        assert_eq!(rules.len(), 2);
        let r = &rules[0];
        assert_eq!(r.long_context_threshold_tokens, Some(100_000));
        assert_eq!(r.cache_write_1h_price_per_1m, Some(0.20));
        assert!(claude("changed page", 123).is_err());
    }
    #[test]
    fn gemini_uses_current_effective_price_and_excludes_storage() {
        let at = chrono::NaiveDate::from_ymd_opt(2026, 11, 10)
            .unwrap()
            .and_hms_opt(0, 0, 0)
            .unwrap()
            .and_utc()
            .timestamp();
        let cell="$2.00 through November 30, 2026.\n$4.00 starting December 1, 2026.\n$50 per hour (storage price)";
        assert_eq!(gemini_rate(cell, at).unwrap().base, 2.0);
        assert_eq!(gemini_rate(cell, at + 31 * 86400).unwrap().base, 4.0);
        let tier = gemini_rate(
            "$1.25, prompts <= 200k tokens\n$2.50, prompts > 200k tokens",
            at,
        )
        .unwrap();
        assert_eq!(tier.base, 1.25);
        assert_eq!(tier.long, Some(2.5));
        assert_eq!(tier.limit, Some(200_000));
        assert!(gemini("changed page", at).is_err());
    }
    #[test]
    #[ignore = "manual fetched official documents contract probe"]
    fn fetched_official_contract() {
        let root = std::env::var("BOOST_PRICE_PROBE_DIR").expect("probe directory");
        for (name, parse) in [
            (
                "claude",
                claude as fn(&str, i64) -> Result<Vec<ModelPriceRule>, String>,
            ),
            ("gemini", gemini),
        ] {
            let doc =
                std::fs::read_to_string(std::path::Path::new(&root).join(format!("{name}.txt")))
                    .unwrap();
            let rules = parse(&doc, boost_core::storage::now_ts())
                .unwrap_or_else(|e| panic!("{name}: {e}"));
            assert!(rules.len() > 5);
            eprintln!("{name}: {} fetched official rules", rules.len());
        }
    }
}
