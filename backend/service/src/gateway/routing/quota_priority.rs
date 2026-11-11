use boost_core::storage::{Account, Token, UsageSnapshotRecord};
use std::collections::HashMap;

// Rank the limiting window, so a full 5h window cannot hide an exhausted week.
// Unknown quota stays behind measured quota; ties preserve the pool's order.
fn remaining_score(snapshot: &UsageSnapshotRecord) -> Option<f64> {
    [snapshot.used_percent, snapshot.secondary_used_percent]
        .into_iter()
        .flatten()
        .filter(|value| value.is_finite())
        .map(|used| (100.0 - used).clamp(0.0, 100.0))
        .reduce(f64::min)
}

pub(super) fn sort_by_snapshots(
    candidates: &mut [(Account, Token)],
    snapshots: &[UsageSnapshotRecord],
) {
    let scores: HashMap<_, _> = snapshots
        .iter()
        .map(|snapshot| {
            (
                snapshot.account_id.as_str(),
                (
                    super::selection::is_low_quota_snapshot(snapshot),
                    remaining_score(snapshot),
                ),
            )
        })
        .collect();
    candidates.sort_by(|(a, _), (b, _)| {
        let a = scores.get(a.id.as_str()).copied().unwrap_or((false, None));
        let b = scores.get(b.id.as_str()).copied().unwrap_or((false, None));
        // AppendFallback must stay behind the normal pool, even if quota is unknown there.
        if a.0 != b.0 {
            return a.0.cmp(&b.0);
        }
        let (a, b) = (a.1, b.1);
        match (a, b) {
            (Some(a), Some(b)) => b.total_cmp(&a),
            (Some(_), None) => std::cmp::Ordering::Less,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            _ => std::cmp::Ordering::Equal,
        }
    });
}

pub(super) fn apply(candidates: &mut [(Account, Token)]) {
    let Some(storage) = crate::storage_helpers::open_storage() else {
        return;
    };
    match storage.latest_usage_snapshots_by_account() {
        Ok(snapshots) => sort_by_snapshots(candidates, &snapshots),
        Err(error) => log::warn!("quota-priority snapshot read failed: {error}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn snapshot(primary: Option<f64>, secondary: Option<f64>) -> UsageSnapshotRecord {
        UsageSnapshotRecord {
            account_id: "test".into(),
            used_percent: primary,
            window_minutes: Some(300),
            resets_at: None,
            secondary_used_percent: secondary,
            secondary_window_minutes: Some(10080),
            secondary_resets_at: None,
            credits_json: None,
            captured_at: 0,
        }
    }
    #[test]
    fn quota_priority_uses_limiting_window_and_handles_unknowns() {
        assert_eq!(
            remaining_score(&snapshot(Some(5.0), Some(90.0))),
            Some(10.0)
        );
        assert_eq!(remaining_score(&snapshot(None, Some(20.0))), Some(80.0));
        assert_eq!(remaining_score(&snapshot(Some(f64::NAN), None)), None);
        assert_eq!(remaining_score(&snapshot(Some(120.0), None)), Some(0.0));
        assert_eq!(remaining_score(&snapshot(Some(-5.0), None)), Some(100.0));
    }
}
