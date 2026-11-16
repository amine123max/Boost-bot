use std::time::{Duration, Instant};

pub(super) struct RestartBudget {
    consecutive: u32,
    started: Instant,
}
impl RestartBudget {
    pub(super) fn new() -> Self {
        Self {
            consecutive: 0,
            started: Instant::now(),
        }
    }
    pub(super) fn failure(&mut self) -> Option<Duration> {
        self.failure_at(Instant::now())
    }
    fn failure_at(&mut self, now: Instant) -> Option<Duration> {
        if now.saturating_duration_since(self.started) >= Duration::from_secs(60) {
            self.consecutive = 0;
        }
        self.consecutive += 1;
        self.started = now;
        if self.consecutive >= 5 {
            return None;
        }
        Some(Duration::from_secs(
            (1u64 << (self.consecutive - 1)).min(30),
        ))
    }
    pub(super) fn restarted(&mut self) {
        self.started = Instant::now();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn restart_storm_is_bounded_and_stable_runtime_resets_the_budget() {
        let mut budget = RestartBudget::new();
        let now = budget.started;
        for seconds in [1, 2, 4, 8] {
            assert_eq!(budget.failure_at(now), Some(Duration::from_secs(seconds)));
        }
        assert_eq!(budget.failure_at(now), None);
        assert_eq!(
            budget.failure_at(now + Duration::from_secs(61)),
            Some(Duration::from_secs(1))
        );
    }
}
