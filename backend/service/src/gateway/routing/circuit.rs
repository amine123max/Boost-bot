//! Bounded, process-local upstream availability breaker, with one-second buckets.
use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

const WINDOW_SECS: u64 = 60;
const MIN_SAMPLES: u64 = 20;
const OPEN_FOR: Duration = Duration::from_secs(30);
const MAX_SOURCES: usize = 4096;

#[derive(Clone, Copy, Debug)]
enum Phase {
    Closed,
    Open(Instant),
    Probe,
}
struct Bucket {
    second: u64,
    samples: u64,
    failures: u64,
}
struct Entry {
    phase: Phase,
    generation: u64,
    buckets: VecDeque<Bucket>,
    touched: Instant,
}
struct State {
    epoch: Instant,
    sources: HashMap<String, Entry>,
}
pub(crate) struct Breaker(Mutex<State>);

pub(crate) struct Permit {
    breaker: Arc<Breaker>,
    key: String,
    generation: u64,
    probe: bool,
    completed: bool,
}

impl Breaker {
    fn new() -> Self {
        Self(Mutex::new(State {
            epoch: Instant::now(),
            sources: HashMap::new(),
        }))
    }
    pub(crate) fn acquire(self: &Arc<Self>, key: &str) -> Option<Permit> {
        self.acquire_at(key, Instant::now())
    }
    fn acquire_at(self: &Arc<Self>, key: &str, now: Instant) -> Option<Permit> {
        let mut state = self.0.lock().unwrap_or_else(|e| e.into_inner());
        if !state.sources.contains_key(key) && state.sources.len() >= MAX_SOURCES {
            state.sources.retain(|_, entry| {
                now.saturating_duration_since(entry.touched) < Duration::from_secs(300)
            });
            if state.sources.len() >= MAX_SOURCES {
                return None;
            }
        }
        let entry = state
            .sources
            .entry(key.to_string())
            .or_insert_with(|| Entry {
                phase: Phase::Closed,
                generation: 0,
                buckets: VecDeque::new(),
                touched: now,
            });
        entry.touched = now;
        let probe = match entry.phase {
            Phase::Closed => false,
            Phase::Open(until) if now >= until => {
                entry.phase = Phase::Probe;
                true
            }
            _ => return None,
        };
        Some(Permit {
            breaker: self.clone(),
            key: key.to_string(),
            generation: entry.generation,
            probe,
            completed: false,
        })
    }
}

impl Permit {
    pub(crate) fn is_probe(&self) -> bool {
        self.probe
    }
    /// 0 means transport failure; local/client 4xx and 499 cancellation are excluded.
    pub(crate) fn finish(mut self, status: u16) {
        self.finish_at(status, Instant::now());
    }
    fn finish_at(&mut self, status: u16, now: Instant) {
        let mut state = self.breaker.0.lock().unwrap_or_else(|e| e.into_inner());
        let second = now.saturating_duration_since(state.epoch).as_secs();
        self.completed = true;
        let Some(entry) = state.sources.get_mut(&self.key) else {
            return;
        };
        if entry.generation != self.generation {
            return;
        }
        entry.touched = now;
        let failure = status == 0 || (500..600).contains(&status);
        let success = (200..400).contains(&status);
        if self.probe {
            entry.generation = entry.generation.wrapping_add(1);
            entry.buckets.clear();
            entry.phase = if success {
                Phase::Closed
            } else {
                Phase::Open(now + OPEN_FOR)
            };
            return;
        }
        if !failure && !success {
            return;
        }
        while entry
            .buckets
            .front()
            .is_some_and(|b| second.saturating_sub(b.second) >= WINDOW_SECS)
        {
            entry.buckets.pop_front();
        }
        if entry.buckets.back().map(|b| b.second) != Some(second) {
            entry.buckets.push_back(Bucket {
                second,
                samples: 0,
                failures: 0,
            });
        }
        let bucket = entry.buckets.back_mut().unwrap();
        bucket.samples = bucket.samples.saturating_add(1);
        bucket.failures = bucket.failures.saturating_add(u64::from(failure));
        let (samples, failures) = entry.buckets.iter().fold((0u64, 0u64), |(s, f), b| {
            (s.saturating_add(b.samples), f.saturating_add(b.failures))
        });
        if samples >= MIN_SAMPLES && failures > samples / 2 {
            entry.phase = Phase::Open(now + OPEN_FOR);
            entry.generation = entry.generation.wrapping_add(1);
            log::warn!(
                "event=upstream_circuit_open source={} samples={} failures={}",
                self.key,
                samples,
                failures
            );
        }
    }
}

impl Drop for Permit {
    fn drop(&mut self) {
        // Cancellation is neutral. A cancelled probe needs a bounded retry interval.
        if self.probe && !self.completed {
            self.finish_at(499, Instant::now());
        }
    }
}

pub(crate) fn global() -> &'static Arc<Breaker> {
    static BREAKER: OnceLock<Arc<Breaker>> = OnceLock::new();
    BREAKER.get_or_init(|| Arc::new(Breaker::new()))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn record(breaker: &Arc<Breaker>, key: &str, status: u16, now: Instant) {
        let mut permit = breaker.acquire_at(key, now).unwrap();
        permit.finish_at(status, now);
    }
    #[test]
    fn strict_threshold_excludes_client_errors_and_isolates_sources() {
        let breaker = Arc::new(Breaker::new());
        let now = Instant::now();
        for _ in 0..10 {
            record(&breaker, "a", 200, now);
            record(&breaker, "a", 503, now);
        }
        assert!(breaker.acquire_at("a", now).is_some());
        for status in [400, 401, 403, 429, 499] {
            record(&breaker, "a", status, now);
        }
        record(&breaker, "a", 502, now);
        assert!(breaker.acquire_at("a", now).is_none());
        assert!(breaker.acquire_at("b", now).is_some());
    }
    #[test]
    fn half_open_has_one_probe_and_stale_success_cannot_close_an_open_circuit() {
        let breaker = Arc::new(Breaker::new());
        let now = Instant::now();
        let mut stale = breaker.acquire_at("a", now).unwrap();
        for _ in 0..20 {
            record(&breaker, "a", 503, now);
        }
        stale.finish_at(200, now);
        assert!(breaker.acquire_at("a", now).is_none());
        let later = now + OPEN_FOR;
        let mut probe = breaker.acquire_at("a", later).unwrap();
        assert!(probe.is_probe());
        assert!(breaker.acquire_at("a", later).is_none());
        probe.finish_at(200, later);
        assert!(!breaker.acquire_at("a", later).unwrap().is_probe());
    }
    #[test]
    fn samples_expire_and_cancelled_probes_do_not_stick() {
        let breaker = Arc::new(Breaker::new());
        let now = Instant::now();
        for _ in 0..19 {
            record(&breaker, "a", 503, now);
        }
        record(&breaker, "a", 200, now + Duration::from_secs(61));
        assert!(breaker
            .acquire_at("a", now + Duration::from_secs(61))
            .is_some());
        for _ in 0..20 {
            record(&breaker, "b", 503, now);
        }
        drop(breaker.acquire_at("b", now + OPEN_FOR).unwrap());
        assert!(breaker.acquire_at("b", Instant::now() + OPEN_FOR).is_some());
    }
}
