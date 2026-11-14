#[derive(Clone, Default)]
pub(super) struct OutputRate {
    baseline: Option<(u64, i64)>,
    latest: Option<(f64, i64)>,
    samples: Vec<(u64, i64, i64)>,
    wait_started: Option<i64>,
    blocked_ms: i64,
    pub kind: &'static str,
}
impl OutputRate {
    pub fn cumulative(&mut self, tokens: u64, at: i64) {
        let Some((previous, since)) = self.baseline else { self.baseline = Some((tokens, at)); return; };
        if at < since || tokens == previous { return; }
        if tokens < previous { self.reset(); self.baseline = Some((tokens, at)); return; }
        let waiting = self.wait_started.map(|start| (at - start.max(since)).max(0)).unwrap_or(0);
        let elapsed = at - since - self.blocked_ms - waiting;
        if elapsed < 250 { return; }
        if elapsed <= 120_000 {
            self.sample(tokens - previous, elapsed, at);
            self.kind = "counter";
        }
        self.baseline = Some((tokens, at));
        self.blocked_ms = 0;
        if self.wait_started.is_some() { self.wait_started = Some(at); }
    }
    fn sample(&mut self, tokens: u64, elapsed: i64, at: i64) {
        self.samples.retain(|(_, _, end)| at - end <= 30_000);
        self.samples.push((tokens, elapsed, at));
        if self.samples.len() > 60 { self.samples.remove(0); }
        let total: u64 = self.samples.iter().map(|sample| sample.0).sum();
        let duration: i64 = self.samples.iter().map(|sample| sample.1).sum();
        if duration > 0 { self.latest = Some((total as f64 * 1000.0 / duration as f64, at)); }
    }
    pub fn response(&mut self, tokens: u64, since: i64, at: i64) {
        let elapsed = at - since;
        if tokens > 0 && since > 0 && elapsed >= 100 && elapsed <= 600_000 {
            self.sample(tokens, elapsed, at);
            self.kind = "request";
        }
    }
    pub fn has_baseline(&self) -> bool { self.baseline.is_some() }
    pub fn waiting(&mut self, waiting: bool, at: i64) {
        if waiting { self.wait_started.get_or_insert(at); }
        else if let Some(start) = self.wait_started.take() { self.blocked_ms += (at - start).max(0); }
    }
    pub fn sampled_at(&self) -> Option<i64> { self.latest.map(|(_, at)| at) }
    pub fn value(&self, now: i64) -> Option<f64> {
        self.latest.filter(|(_, at)| (0..15_000).contains(&(now - at))).map(|(value, _)| value)
    }
    pub fn retained(&self, now: i64) -> Option<f64> {
        self.latest.filter(|(_, at)| (0..60_000).contains(&(now - at))).map(|(value, _)| value)
    }
    pub fn reset(&mut self) { *self = Self::default(); }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn actual_token_deltas_use_elapsed_time_and_expire() {
        let mut rate = OutputRate::default();
        rate.cumulative(100, 1000);
        assert_eq!(rate.value(1000), None);
        rate.cumulative(160, 3000);
        assert_eq!(rate.value(3000), Some(30.0));
        rate.cumulative(160, 4000);
        assert_eq!(rate.value(7999), Some(30.0));
        assert_eq!(rate.value(8000), Some(30.0));
        assert_eq!(rate.value(18_000), None);
        assert_eq!(rate.retained(18_000), Some(30.0));
        assert_eq!(rate.retained(63_000), None);
        assert_eq!(rate.value(33_000), None);
        rate.cumulative(10, 5000);
        assert_eq!(rate.value(5000), None);
    }
    #[test]
    fn new_turn_drops_the_previous_rate_and_baseline() {
        let mut rate = OutputRate::default();
        rate.response(50, 1000, 2000);
        assert_eq!(rate.value(2000), Some(50.0));
        rate.reset();
        assert_eq!(rate.value(2001), None);
        rate.cumulative(9000, 2100);
        assert_eq!(rate.value(2100), None);
    }
    #[test]
    fn missing_or_zero_time_does_not_fabricate_rate() {
        let mut rate = OutputRate::default();
        rate.response(50, 0, 1000);
        rate.response(50, 1000, 1000);
        assert_eq!(rate.value(1000), None);
        rate.response(90, 1000, 4000);
        assert_eq!(rate.value(4000), Some(30.0));
    }
    #[test]
    fn short_bursts_accumulate_and_tool_waits_do_not_lower_generation_rate() {
        let mut rate = OutputRate::default();
        rate.cumulative(100, 1000);
        rate.cumulative(105, 1100);
        rate.cumulative(110, 1200);
        rate.cumulative(115, 1300);
        assert_eq!(rate.value(1300), Some(50.0));
        rate.waiting(true, 1300);
        rate.waiting(false, 6300);
        rate.cumulative(130, 6600);
        assert_eq!(rate.value(6600), Some(50.0));
        rate.cumulative(130, 7000);
        assert_eq!(rate.sampled_at(), Some(6600));
    }
}
