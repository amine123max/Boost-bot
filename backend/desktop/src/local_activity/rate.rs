#[derive(Clone, Default)]
pub(super) struct OutputRate {
    baseline: Option<(u64, i64)>,
    latest: Option<(f64, i64)>,
}
impl OutputRate {
    pub fn cumulative(&mut self, tokens: u64, at: i64) {
        if let Some((previous, since)) = self.baseline {
            if tokens < previous {
                self.latest = None;
            } else if tokens > previous {
                self.response(tokens - previous, since, at);
            }
            if tokens == previous {
                return;
            }
        }
        self.baseline = Some((tokens, at));
    }
    pub fn response(&mut self, tokens: u64, since: i64, at: i64) {
        let elapsed = at - since;
        if tokens > 0 && since > 0 && elapsed >= 100 {
            self.latest = Some((tokens as f64 * 1000.0 / elapsed as f64, at));
        }
    }
    pub fn value(&self, now: i64) -> Option<f64> {
        self.latest
            .filter(|(_, at)| (0..30_000).contains(&(now - at)))
            .map(|(value, _)| value)
    }
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
        assert_eq!(rate.value(33_000), None);
        rate.cumulative(10, 5000);
        assert_eq!(rate.value(5000), None);
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
}
