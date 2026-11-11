use super::request_token_stats::token_usage_rollup_from_row;
use super::{Storage, TokenUsageRollup};
use rusqlite::{params, Result};

#[derive(Debug, Default)]
pub struct UsageHistory {
    pub totals: TokenUsageRollup,
    pub days: Vec<(String, TokenUsageRollup)>,
    pub has_undated_history: bool,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::{RequestLog, RequestTokenStat};

    fn record(storage: &Storage, key: &str, at: i64, status: i64) {
        let log = RequestLog {
            key_id: Some(key.into()),
            request_path: "/v1/responses".into(),
            method: "POST".into(),
            status_code: Some(status),
            created_at: at,
            ..Default::default()
        };
        let stat = RequestTokenStat {
            request_log_id: 0,
            key_id: Some(key.into()),
            account_id: None,
            model: None,
            input_tokens: Some(1000),
            cached_input_tokens: Some(800),
            output_tokens: Some(200),
            total_tokens: Some(1200),
            reasoning_output_tokens: Some(50),
            estimated_cost_usd: Some(0.125),
            created_at: at,
        };
        storage
            .insert_request_log_with_token_stat(&log, &stat)
            .unwrap();
    }

    #[test]
    fn history_survives_retention_and_log_clearing_without_resetting_key_totals() {
        let storage = Storage::open_in_memory().unwrap();
        storage.init().unwrap();
        record(&storage, "key-one", 1700000000, 200);
        record(&storage, "key-one", 1700086400, 500);
        storage
            .insert_request_log(&RequestLog {
                key_id: Some("key-one".into()),
                status_code: Some(503),
                created_at: 1700086401,
                ..Default::default()
            })
            .unwrap();
        let before = storage.read_usage_history(true, None).unwrap();
        assert_eq!(before.totals.request_count, 3);
        assert_eq!(before.totals.total_tokens, 2400);
        assert_eq!(before.totals.cached_input_tokens, 1600);
        assert_eq!(before.totals.estimated_cost_usd, 0.25);
        assert_eq!(before.days.len(), 2);
        assert_eq!(before.days[1].1.request_count, 2);
        assert_eq!(before.days[1].1.error_count, 2);
        storage.clear_request_logs().unwrap();
        storage.init().unwrap();
        let after = storage.read_usage_history(true, None).unwrap();
        assert_eq!(after.totals.request_count, 3);
        assert_eq!(after.totals.total_tokens, 2400);
        assert_eq!(after.totals.estimated_cost_usd, 0.25);
        assert_eq!(after.days[0].1.total_tokens, 1200);
        assert_eq!(after.days[1].1.total_tokens, 1200);
        assert!(!after.has_undated_history);
        assert_eq!(
            storage.summarize_request_token_stats_by_key().unwrap()[0].total_tokens,
            2400
        );
    }

    #[test]
    fn history_respects_key_ownership_and_local_midnight() {
        let storage = Storage::open_in_memory().unwrap();
        storage.init().unwrap();
        let midnight: i64 = storage
            .conn
            .query_row(
                "SELECT CAST(strftime('%s','2026-11-11 00:00:00','utc') AS INTEGER)",
                [],
                |row| row.get(0),
            )
            .unwrap();
        storage.conn.execute_batch("INSERT INTO app_users(id,username,password_hash,role,status,created_at,updated_at) VALUES('alice','alice','unused-test-hash','member','active',0,0);
            INSERT INTO api_keys(id,name,key_hash,status,created_at) VALUES('key-one','one','test-hash','active',0);").unwrap();
        record(&storage, "key-one", midnight - 1, 200);
        record(&storage, "key-one", midnight, 200);
        record(&storage, "key-two", midnight, 200);
        storage.conn.execute("INSERT INTO api_key_owners(key_id,owner_kind,owner_user_id,updated_at) VALUES('key-one','user','alice',0)",[]).unwrap();
        let alice = storage.read_usage_history(true, Some("alice")).unwrap();
        assert_eq!(alice.totals.request_count, 2);
        assert_eq!(alice.totals.total_tokens, 2400);
        assert_eq!(alice.days[0].0, "2026-11-10");
        assert_eq!(alice.days[1].0, "2026-11-11");
        assert_eq!(
            storage
                .read_usage_history(true, Some("bob"))
                .unwrap()
                .totals
                .request_count,
            0
        );
        assert_eq!(
            storage
                .read_usage_history(true, None)
                .unwrap()
                .totals
                .request_count,
            3
        );
    }

    #[test]
    fn legacy_lifetime_totals_are_preserved_without_inventing_daily_history() {
        let storage = Storage::open_in_memory().unwrap();
        storage.init().unwrap();
        for trigger in [
            "usage_daily_request_insert",
            "usage_daily_token_insert",
            "usage_daily_token_update",
        ] {
            storage
                .conn
                .execute_batch(&format!("DROP TRIGGER {trigger};"))
                .unwrap();
        }
        storage
            .conn
            .execute_batch("DROP TABLE usage_daily_rollups;DROP TABLE usage_history_legacy_keys;")
            .unwrap();
        record(&storage, "legacy", 1700000000, 200);
        storage.clear_request_logs().unwrap();
        record(&storage, "legacy", 1700086400, 200);
        storage
            .conn
            .execute_batch(include_str!("../../migrations/074_usage_daily_history.sql"))
            .unwrap();
        let history = storage.read_usage_history(true, None).unwrap();
        assert_eq!(history.totals.total_tokens, 2400);
        assert_eq!(history.totals.request_count, 2);
        assert!(history.has_undated_history);
        assert_eq!(history.days.len(), 1);
        assert_eq!(history.days[0].1.total_tokens, 1200);
        storage
            .conn
            .execute("UPDATE request_token_stats SET estimated_cost_usd=0.5", [])
            .unwrap();
        let repriced = storage.read_usage_history(true, None).unwrap();
        assert_eq!(repriced.totals.estimated_cost_usd, 0.625);
        assert_eq!(repriced.days[0].1.estimated_cost_usd, 0.5);
    }
}

const FILTER: &str = "(?1=0 OR TRIM(s.key_id)<>'')
    AND (?2 IS NULL OR s.key_id IN (
        SELECT key_id FROM api_key_owners WHERE owner_kind='user' AND owner_user_id=?2
    ))";

impl Storage {
    pub(super) fn migrate_usage_history(&self) -> Result<()> {
        // Schema, backfill, triggers and the migration marker commit together.
        let transaction = rusqlite::Transaction::new_unchecked(
            &self.conn,
            rusqlite::TransactionBehavior::Immediate,
        )?;
        if !self.has_migration("074_usage_daily_history")? {
            transaction
                .execute_batch(include_str!("../../migrations/074_usage_daily_history.sql"))?;
            self.mark_migration("074_usage_daily_history")?;
        }
        transaction.commit()
    }

    /// Lifetime tokens/cost continue using the same detailed + compacted records
    /// as API-key quotas. Calendar records never replace or reset those totals.
    pub fn read_usage_history(
        &self,
        keys_only: bool,
        user_id: Option<&str>,
    ) -> Result<UsageHistory> {
        let totals_sql = format!("WITH all_stats AS (
            SELECT COALESCE(key_id,'') key_id,input_tokens,cached_input_tokens,output_tokens,
                reasoning_output_tokens,total_tokens,estimated_cost_usd,1 request_count
            FROM request_token_stats
            UNION ALL
            SELECT key_id,input_tokens,cached_input_tokens,output_tokens,reasoning_output_tokens,
                total_tokens,estimated_cost_usd,source_rows request_count FROM request_token_stat_rollups
        ) SELECT
            COALESCE(SUM(MAX(IFNULL(input_tokens,0),0)),0),
            COALESCE(SUM(MIN(MAX(IFNULL(cached_input_tokens,0),0),MAX(IFNULL(input_tokens,0),0))),0),
            COALESCE(SUM(MAX(IFNULL(output_tokens,0),0)),0),
            COALESCE(SUM(MAX(IFNULL(reasoning_output_tokens,0),0)),0),
            COALESCE(SUM(MAX(COALESCE(total_tokens,IFNULL(input_tokens,0)+IFNULL(output_tokens,0)),0)),0),
            COALESCE(SUM(MAX(IFNULL(estimated_cost_usd,0),0)),0),
            COALESCE(SUM(request_count),0),0,0
        FROM all_stats s WHERE {FILTER}");
        let mut totals = self
            .conn
            .query_row(&totals_sql, params![keys_only, user_id], |row| {
                token_usage_rollup_from_row(row, 0)
            })?;
        let daily_sql = format!(
            "SELECT day,SUM(input_tokens),SUM(cached_input_tokens),SUM(output_tokens),
            SUM(reasoning_output_tokens),SUM(total_tokens),SUM(estimated_cost_usd),
            SUM(request_count),SUM(success_count),SUM(error_count)
            FROM usage_daily_rollups s WHERE {FILTER} GROUP BY day ORDER BY day"
        );
        let mut statement = self.conn.prepare(&daily_sql)?;
        let days = statement
            .query_map(params![keys_only, user_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    token_usage_rollup_from_row(row, 1)?,
                ))
            })?
            .collect::<Result<Vec<_>>>()?;
        let has_undated_history: bool = self.conn.query_row(
            &format!("SELECT EXISTS(SELECT 1 FROM usage_history_legacy_keys s WHERE {FILTER})"),
            params![keys_only, user_id],
            |row| row.get(0),
        )?;
        let daily_request_count: i64 = days.iter().map(|(_, usage)| usage.request_count).sum();
        totals.request_count = if has_undated_history {
            // Legacy compaction kept token-stat counts, but discarded the dates
            // and failed requests without stats. Report a confirmed lower bound.
            totals.request_count.max(daily_request_count)
        } else {
            daily_request_count
        };
        totals.success_count = days.iter().map(|(_, usage)| usage.success_count).sum();
        totals.error_count = days.iter().map(|(_, usage)| usage.error_count).sum();
        Ok(UsageHistory {
            totals,
            days,
            has_undated_history,
        })
    }
}
