//! Process-local admission. No waiting queue is created for model requests.
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex, MutexGuard, OnceLock};
use std::time::{Duration, Instant};

pub(crate) const SETTINGS_KEY: &str = "gateway.resource_limits.v1";
const MAX_RATE_KEYS: usize = 4096;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ResourceLimits {
    pub global_qps: u32,
    pub burst: u32,
    pub key_rpm: u32,
    pub max_inflight: usize,
    pub model_max_inflight: usize,
    pub max_request_body_bytes: usize,
    pub buffered_body_budget_bytes: usize,
}

impl Default for ResourceLimits {
    fn default() -> Self {
        Self {
            global_qps: 20,
            burst: 20,
            key_rpm: 0,
            max_inflight: 24,
            model_max_inflight: 8,
            max_request_body_bytes: 32 * 1024 * 1024,
            buffered_body_budget_bytes: 64 * 1024 * 1024,
        }
    }
}

impl ResourceLimits {
    pub(crate) fn validate(&self) -> Result<(), String> {
        if self.global_qps > 100_000
            || !(1..=100_000).contains(&self.burst)
            || self.key_rpm > 1_000_000
            || !(1..=512).contains(&self.max_inflight)
            || !(1..=512).contains(&self.model_max_inflight)
            || !(1024..=256 * 1024 * 1024).contains(&self.max_request_body_bytes)
            || self.buffered_body_budget_bytes < self.max_request_body_bytes
            || self.buffered_body_budget_bytes > 1024 * 1024 * 1024
        {
            return Err("invalid gateway resource limits".into());
        }
        Ok(())
    }
}

struct Bucket {
    tokens: f64,
    updated: Instant,
}
impl Bucket {
    fn full(capacity: u32, now: Instant) -> Self {
        Self {
            tokens: capacity as f64,
            updated: now,
        }
    }
    fn refill(&mut self, capacity: u32, rate: f64, now: Instant) {
        self.tokens = (self.tokens
            + now.saturating_duration_since(self.updated).as_secs_f64() * rate)
            .min(capacity as f64);
        self.updated = now;
    }
    fn retry_after(&self, rate: f64) -> u64 {
        ((1.0 - self.tokens).max(0.0) / rate).ceil().max(1.0) as u64
    }
}

struct State {
    config: ResourceLimits,
    active: usize,
    buffered: usize,
    global: Bucket,
    keys: HashMap<String, Bucket>,
    models: HashMap<String, usize>,
}

pub(crate) struct Limiter {
    state: Mutex<State>,
    quota_reserved: Mutex<HashMap<String, i64>>,
}

#[derive(Debug)]
pub(crate) struct Rejected {
    pub reason: &'static str,
    pub retry_after: u64,
}

pub(crate) struct Admission {
    limiter: Arc<Limiter>,
    model: Option<String>,
    body_bytes: usize,
    max_body_bytes: usize,
    quota: Option<(String, i64)>,
}

impl Limiter {
    fn new(config: ResourceLimits) -> Self {
        Self {
            state: Mutex::new(State {
                global: Bucket::full(config.burst, Instant::now()),
                config,
                active: 0,
                buffered: 0,
                keys: HashMap::new(),
                models: HashMap::new(),
            }),
            quota_reserved: Mutex::new(HashMap::new()),
        }
    }
    fn state(&self) -> MutexGuard<'_, State> {
        self.state.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub(crate) fn enter(self: &Arc<Self>, storage_capacity: usize) -> Result<Admission, Rejected> {
        let mut state = self.state();
        // Long-lived streams retain a connection today. Reserve headroom for management.
        let reserved = (storage_capacity / 4).max(1);
        let capacity = state
            .config
            .max_inflight
            .min(storage_capacity.saturating_sub(reserved).max(1));
        if state.active >= capacity {
            return Err(Rejected {
                reason: "gateway_concurrency_exhausted",
                retry_after: 1,
            });
        }
        state.active += 1;
        Ok(Admission {
            limiter: self.clone(),
            model: None,
            body_bytes: 0,
            max_body_bytes: state.config.max_request_body_bytes,
            quota: None,
        })
    }
}

impl Admission {
    pub(crate) fn max_body_bytes(&self) -> usize {
        self.max_body_bytes
    }

    pub(crate) fn release_model(&mut self) {
        if let Some(model) = self.model.take() {
            let mut state = self.limiter.state();
            if let Some(count) = state.models.get_mut(&model) {
                *count = count.saturating_sub(1);
            }
            if state.models.get(&model) == Some(&0) {
                state.models.remove(&model);
            }
        }
        self.release_quota();
    }

    fn release_quota(&mut self) {
        if let Some((key, amount)) = self.quota.take() {
            let mut reservations = self
                .limiter
                .quota_reserved
                .lock()
                .unwrap_or_else(|e| e.into_inner());
            if let Some(reserved) = reservations.get_mut(&key) {
                *reserved = reserved.saturating_sub(amount);
            }
            if reservations.get(&key) == Some(&0) {
                reservations.remove(&key);
            }
        }
    }

    pub(crate) fn reserve_body(&mut self, bytes: usize) -> Result<(), Rejected> {
        let mut state = self.limiter.state();
        if bytes
            > state
                .config
                .buffered_body_budget_bytes
                .saturating_sub(state.buffered)
        {
            return Err(Rejected {
                reason: "gateway_body_budget_exhausted",
                retry_after: 1,
            });
        }
        state.buffered += bytes;
        self.body_bytes += bytes;
        Ok(())
    }

    /// Conservative process-local reservation. Unknown output size must be bounded by the request.
    pub(super) fn reserve_quota(
        &mut self,
        storage: &boost_core::storage::Storage,
        key: &str,
        body: &[u8],
    ) -> Result<(), crate::gateway::local_validation::LocalValidationError> {
        if self.quota.is_some() {
            return Err(crate::gateway::local_validation::LocalValidationError::new(
                500,
                "duplicate quota reservation",
            ));
        }
        let limit = storage.find_api_key_quota_limit(key).map_err(|_| {
            crate::gateway::local_validation::LocalValidationError::new(
                503,
                "quota storage unavailable",
            )
        })?;
        let Some(limit) = limit.filter(|value| *value > 0) else {
            return Ok(());
        };
        let request: serde_json::Value = serde_json::from_slice(body).map_err(|_| {
            crate::gateway::local_validation::LocalValidationError::new(
                400,
                "quota-limited requests require JSON",
            )
        })?;
        let output = ["max_output_tokens", "max_completion_tokens", "max_tokens"]
            .iter()
            .find_map(|name| request.get(*name).and_then(serde_json::Value::as_i64))
            .or_else(|| {
                request
                    .get("generationConfig")
                    .and_then(|v| v.get("maxOutputTokens"))
                    .and_then(serde_json::Value::as_i64)
            })
            .filter(|value| *value > 0)
            .ok_or_else(|| {
                crate::gateway::local_validation::LocalValidationError::new(
                    400,
                    "quota-limited requests require a positive output token limit",
                )
            })?;
        // UTF-8 byte length is a conservative text-token estimate, not a multimodal upper bound.
        // Hidden provider context and media accounting still require provider-specific estimates.
        let estimate = i64::try_from(body.len())
            .unwrap_or(i64::MAX)
            .saturating_add(output);
        let mut reservations = self
            .limiter
            .quota_reserved
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        let used = storage
            .api_key_total_token_usage(key)
            .map_err(|_| {
                crate::gateway::local_validation::LocalValidationError::new(
                    503,
                    "quota usage unavailable",
                )
            })?
            .max(0);
        let reserved = reservations.get(key).copied().unwrap_or(0);
        if estimate > limit.saturating_sub(used).saturating_sub(reserved) {
            return Err(crate::gateway::local_validation::LocalValidationError::new(
                429,
                "api key quota insufficient for requested token budget",
            ));
        }
        *reservations.entry(key.to_string()).or_default() = reserved.saturating_add(estimate);
        self.quota = Some((key.to_string(), estimate));
        Ok(())
    }

    pub(crate) fn authenticate(&mut self, key: &str, model: Option<&str>) -> Result<(), Rejected> {
        self.authenticate_at(key, model, Instant::now())
    }

    fn authenticate_at(
        &mut self,
        key: &str,
        model: Option<&str>,
        now: Instant,
    ) -> Result<(), Rejected> {
        if self.model.is_some() {
            return Err(Rejected {
                reason: "request_already_admitted",
                retry_after: 1,
            });
        }
        let mut state = self.limiter.state();
        let config = state.config.clone();
        let model = model
            .filter(|value| !value.is_empty())
            .unwrap_or("<unspecified>");
        if state.models.get(model).copied().unwrap_or(0) >= config.model_max_inflight {
            return Err(Rejected {
                reason: "model_concurrency_exhausted",
                retry_after: 1,
            });
        }
        if config.global_qps > 0 {
            state
                .global
                .refill(config.burst, config.global_qps as f64, now);
            if state.global.tokens < 1.0 {
                return Err(Rejected {
                    reason: "global_rate_exhausted",
                    retry_after: state.global.retry_after(config.global_qps as f64),
                });
            }
        }
        if config.key_rpm > 0 {
            // Expired buckets are full by this point; bounded retention preserves rate semantics.
            if !state.keys.contains_key(key) && state.keys.len() >= MAX_RATE_KEYS {
                state.keys.retain(|_, value| {
                    now.saturating_duration_since(value.updated) < Duration::from_secs(120)
                });
                if state.keys.len() >= MAX_RATE_KEYS {
                    return Err(Rejected {
                        reason: "key_rate_capacity_exhausted",
                        retry_after: 1,
                    });
                }
            }
            let rate = config.key_rpm as f64 / 60.0;
            let bucket = state
                .keys
                .entry(key.to_owned())
                .or_insert_with(|| Bucket::full(config.key_rpm, now));
            bucket.refill(config.key_rpm, rate, now);
            if bucket.tokens < 1.0 {
                return Err(Rejected {
                    reason: "key_rate_exhausted",
                    retry_after: bucket.retry_after(rate),
                });
            }
        }
        if config.global_qps > 0 {
            state.global.tokens -= 1.0;
        }
        if config.key_rpm > 0 {
            state.keys.get_mut(key).unwrap().tokens -= 1.0;
        }
        *state.models.entry(model.to_owned()).or_default() += 1;
        self.model = Some(model.to_owned());
        Ok(())
    }
}

impl Drop for Admission {
    fn drop(&mut self) {
        self.release_quota();
        let mut state = self.limiter.state();
        state.active = state.active.saturating_sub(1);
        state.buffered = state.buffered.saturating_sub(self.body_bytes);
        if let Some(model) = &self.model {
            if let Some(count) = state.models.get_mut(model) {
                *count = count.saturating_sub(1);
            }
            if state.models.get(model) == Some(&0) {
                state.models.remove(model);
            }
        }
    }
}

pub(crate) fn global() -> &'static Arc<Limiter> {
    static INSTANCE: OnceLock<Arc<Limiter>> = OnceLock::new();
    INSTANCE.get_or_init(|| Arc::new(Limiter::new(ResourceLimits::default())))
}

pub(crate) fn current() -> ResourceLimits {
    global().state().config.clone()
}

pub(crate) fn apply(config: ResourceLimits) -> Result<(), String> {
    config.validate()?;
    let mut state = global().state();
    // Do not refill an exhausted limiter by repeatedly saving settings.
    let available = state.global.tokens.min(config.burst as f64);
    state.global = Bucket {
        tokens: available,
        updated: Instant::now(),
    };
    for bucket in state.keys.values_mut() {
        bucket.tokens = bucket.tokens.min(config.key_rpm as f64);
    }
    state.config = config;
    Ok(())
}

pub(crate) fn persist(config: ResourceLimits) -> Result<(), String> {
    config.validate()?;
    let value = serde_json::to_string(&config).map_err(|e| e.to_string())?;
    crate::app_settings::save_persisted_app_setting(SETTINGS_KEY, Some(&value))?;
    apply(config)
}

pub(crate) fn load() {
    if let Some(value) = crate::app_settings::get_persisted_app_setting(SETTINGS_KEY) {
        match serde_json::from_str::<ResourceLimits>(&value)
            .map_err(|e| e.to_string())
            .and_then(apply)
        {
            Ok(()) => {}
            Err(error) => log::error!("invalid persisted gateway limits: {error}"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn concurrency_and_body_memory_remain_bounded_and_release_on_drop() {
        let limiter = Arc::new(Limiter::new(ResourceLimits::default()));
        let mut active = Vec::new();
        for _ in 0..24 {
            active.push(limiter.enter(32).unwrap());
        }
        assert!(limiter.enter(32).is_err());
        active[0].reserve_body(32 * 1024 * 1024).unwrap();
        active[1].reserve_body(32 * 1024 * 1024).unwrap();
        assert!(active[2].reserve_body(1).is_err());
        drop(active);
        assert_eq!(limiter.state().active, 0);
        assert_eq!(limiter.state().buffered, 0);
        assert!(limiter.enter(32).is_ok());
    }

    #[test]
    fn model_limits_do_not_block_other_models_or_leak_rate_tokens() {
        let limiter = Arc::new(Limiter::new(ResourceLimits {
            model_max_inflight: 1,
            ..Default::default()
        }));
        let mut first = limiter.enter(32).unwrap();
        first.authenticate("key", Some("model-a")).unwrap();
        let mut second = limiter.enter(32).unwrap();
        assert_eq!(
            second
                .authenticate("key", Some("model-a"))
                .unwrap_err()
                .reason,
            "model_concurrency_exhausted"
        );
        second.authenticate("key", Some("model-b")).unwrap();
        drop((first, second));
        assert!(limiter.state().models.is_empty());
    }

    #[test]
    fn token_buckets_refill_by_monotonic_time_and_key_limits_are_independent() {
        let limiter = Arc::new(Limiter::new(ResourceLimits {
            global_qps: 0,
            key_rpm: 1,
            ..Default::default()
        }));
        let now = Instant::now();
        let mut first = limiter.enter(32).unwrap();
        first.authenticate_at("a", Some("m"), now).unwrap();
        drop(first);
        let mut next = limiter.enter(32).unwrap();
        let rejected = next.authenticate_at("a", Some("m"), now).unwrap_err();
        assert_eq!(rejected.reason, "key_rate_exhausted");
        assert_eq!(rejected.retry_after, 60);
        next.authenticate_at("b", Some("m"), now).unwrap();
        drop(next);
        let mut later = limiter.enter(32).unwrap();
        later
            .authenticate_at("a", Some("m"), now + Duration::from_secs(60))
            .unwrap();
    }

    #[test]
    fn global_qps_has_an_explicit_burst_and_refill() {
        let limiter = Arc::new(Limiter::new(ResourceLimits {
            global_qps: 2,
            burst: 1,
            ..Default::default()
        }));
        let now = Instant::now();
        let mut first = limiter.enter(32).unwrap();
        first.authenticate_at("a", None, now).unwrap();
        drop(first);
        let mut next = limiter.enter(32).unwrap();
        assert_eq!(
            next.authenticate_at("b", None, now).unwrap_err().reason,
            "global_rate_exhausted"
        );
        next.authenticate_at("b", None, now + Duration::from_millis(500))
            .unwrap();
    }

    #[test]
    fn quota_reservations_prevent_concurrent_text_budget_oversubscription_and_release() {
        let storage = boost_core::storage::Storage::open_in_memory().unwrap();
        storage.init().unwrap();
        storage
            .insert_api_key(&boost_core::storage::ApiKey {
                id: "key".into(),
                name: None,
                model_slug: None,
                reasoning_effort: None,
                service_tier: None,
                rotation_strategy: "account_rotation".into(),
                aggregate_api_id: None,
                account_plan_filter: None,
                aggregate_api_url: None,
                client_type: "codex".into(),
                protocol_type: "openai_compat".into(),
                auth_scheme: "authorization_bearer".into(),
                upstream_base_url: None,
                static_headers_json: None,
                key_hash: "fixture-hash".into(),
                status: "active".into(),
                created_at: 1,
                last_used_at: None,
            })
            .unwrap();
        storage
            .upsert_api_key_quota_limit("key", Some(1000))
            .unwrap();
        let limiter = Arc::new(Limiter::new(ResourceLimits::default()));
        let mut first = limiter.enter(32).unwrap();
        first
            .reserve_quota(&storage, "key", br#"{"max_output_tokens":600}"#)
            .unwrap();
        let mut second = limiter.enter(32).unwrap();
        let rejected = second
            .reserve_quota(&storage, "key", br#"{"max_output_tokens":600}"#)
            .unwrap_err();
        assert_eq!(rejected.status_code, 429);
        assert!(rejected.retry_after.is_none());
        drop(first);
        second
            .reserve_quota(&storage, "key", br#"{"max_output_tokens":600}"#)
            .unwrap();
        drop(second);
        assert!(limiter.quota_reserved.lock().unwrap().is_empty());
        let mut unbounded = limiter.enter(32).unwrap();
        assert_eq!(
            unbounded
                .reserve_quota(&storage, "key", br#"{"input":"test"}"#)
                .unwrap_err()
                .status_code,
            400
        );
    }
}
