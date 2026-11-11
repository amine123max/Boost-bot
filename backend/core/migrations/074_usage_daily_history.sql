-- Preserve daily history independently of request-detail retention and key quota accounting.
CREATE TABLE usage_daily_rollups (
    day TEXT NOT NULL,
    key_id TEXT NOT NULL DEFAULT '',
    request_count INTEGER NOT NULL DEFAULT 0,
    success_count INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    cached_input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    reasoning_output_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    estimated_cost_usd REAL NOT NULL DEFAULT 0,
    PRIMARY KEY(day,key_id)
);
CREATE INDEX idx_usage_daily_key_day ON usage_daily_rollups(key_id,day);

-- Existing compacted stats have no original dates. Keep their long-term totals,
-- but never assign them to invented calendar days.
CREATE TABLE usage_history_legacy_keys(key_id TEXT PRIMARY KEY);
INSERT INTO usage_history_legacy_keys(key_id)
SELECT DISTINCT key_id FROM request_token_stat_rollups WHERE source_rows>0;

INSERT INTO usage_daily_rollups(day,key_id,request_count,success_count,error_count)
SELECT date(created_at,'unixepoch','localtime'),COALESCE(TRIM(key_id),''),COUNT(*),
       SUM(CASE WHEN status_code BETWEEN 200 AND 299 THEN 1 ELSE 0 END),
       SUM(CASE WHEN status_code>=400 OR TRIM(IFNULL(error,''))<>'' THEN 1 ELSE 0 END)
FROM request_logs GROUP BY 1,2;

INSERT INTO usage_daily_rollups(day,key_id,request_count,input_tokens,cached_input_tokens,output_tokens,reasoning_output_tokens,total_tokens,estimated_cost_usd)
SELECT date(COALESCE(r.created_at,t.created_at),'unixepoch','localtime'),
       COALESCE(NULLIF(TRIM(r.key_id),''),TRIM(t.key_id),''),
       SUM(CASE WHEN r.id IS NULL THEN 1 ELSE 0 END),
       SUM(MAX(IFNULL(t.input_tokens,0),0)),
       SUM(MIN(MAX(IFNULL(t.cached_input_tokens,0),0),MAX(IFNULL(t.input_tokens,0),0))),
       SUM(MAX(IFNULL(t.output_tokens,0),0)),
       SUM(MAX(IFNULL(t.reasoning_output_tokens,0),0)),
       SUM(MAX(COALESCE(t.total_tokens,IFNULL(t.input_tokens,0)+IFNULL(t.output_tokens,0)),0)),
       SUM(MAX(IFNULL(t.estimated_cost_usd,0),0))
FROM request_token_stats t LEFT JOIN request_logs r ON r.id=t.request_log_id
WHERE 1 GROUP BY 1,2
ON CONFLICT(day,key_id) DO UPDATE SET
    request_count=usage_daily_rollups.request_count+excluded.request_count,
    input_tokens=usage_daily_rollups.input_tokens+excluded.input_tokens,
    cached_input_tokens=usage_daily_rollups.cached_input_tokens+excluded.cached_input_tokens,
    output_tokens=usage_daily_rollups.output_tokens+excluded.output_tokens,
    reasoning_output_tokens=usage_daily_rollups.reasoning_output_tokens+excluded.reasoning_output_tokens,
    total_tokens=usage_daily_rollups.total_tokens+excluded.total_tokens,
    estimated_cost_usd=usage_daily_rollups.estimated_cost_usd+excluded.estimated_cost_usd;

CREATE TRIGGER usage_daily_request_insert AFTER INSERT ON request_logs BEGIN
    INSERT INTO usage_daily_rollups(day,key_id,request_count,success_count,error_count)
    VALUES(date(NEW.created_at,'unixepoch','localtime'),COALESCE(TRIM(NEW.key_id),''),1,
        CASE WHEN NEW.status_code BETWEEN 200 AND 299 THEN 1 ELSE 0 END,
        CASE WHEN NEW.status_code>=400 OR TRIM(IFNULL(NEW.error,''))<>'' THEN 1 ELSE 0 END)
    ON CONFLICT(day,key_id) DO UPDATE SET
        request_count=usage_daily_rollups.request_count+1,
        success_count=usage_daily_rollups.success_count+excluded.success_count,
        error_count=usage_daily_rollups.error_count+excluded.error_count;
END;

CREATE TRIGGER usage_daily_token_insert AFTER INSERT ON request_token_stats BEGIN
    INSERT INTO usage_daily_rollups(day,key_id,input_tokens,cached_input_tokens,output_tokens,reasoning_output_tokens,total_tokens,estimated_cost_usd)
    VALUES (date(COALESCE((SELECT created_at FROM request_logs WHERE id=NEW.request_log_id),NEW.created_at),'unixepoch','localtime'),COALESCE(NULLIF(TRIM((SELECT key_id FROM request_logs WHERE id=NEW.request_log_id)),''),TRIM(NEW.key_id),''),MAX(IFNULL(NEW.input_tokens,0),0),MIN(MAX(IFNULL(NEW.cached_input_tokens,0),0),MAX(IFNULL(NEW.input_tokens,0),0)),MAX(IFNULL(NEW.output_tokens,0),0),MAX(IFNULL(NEW.reasoning_output_tokens,0),0),MAX(COALESCE(NEW.total_tokens,IFNULL(NEW.input_tokens,0)+IFNULL(NEW.output_tokens,0)),0),MAX(IFNULL(NEW.estimated_cost_usd,0),0))
    ON CONFLICT(day,key_id) DO UPDATE SET
      input_tokens=usage_daily_rollups.input_tokens+excluded.input_tokens,
      cached_input_tokens=usage_daily_rollups.cached_input_tokens+excluded.cached_input_tokens,
      output_tokens=usage_daily_rollups.output_tokens+excluded.output_tokens,
      reasoning_output_tokens=usage_daily_rollups.reasoning_output_tokens+excluded.reasoning_output_tokens,
      total_tokens=usage_daily_rollups.total_tokens+excluded.total_tokens,
      estimated_cost_usd=usage_daily_rollups.estimated_cost_usd+excluded.estimated_cost_usd;
    UPDATE usage_daily_rollups SET request_count=request_count+1
    WHERE day=date(COALESCE((SELECT created_at FROM request_logs WHERE id=NEW.request_log_id),NEW.created_at),'unixepoch','localtime') AND key_id=COALESCE(NULLIF(TRIM((SELECT key_id FROM request_logs WHERE id=NEW.request_log_id)),''),TRIM(NEW.key_id),'')
      AND NOT EXISTS(SELECT 1 FROM request_logs WHERE id=NEW.request_log_id);
END;

-- Repricing updates must also reach the calendar. Retention deletes deliberately
-- do not subtract history, since the original counters remain valid.
CREATE TRIGGER usage_daily_token_update
AFTER UPDATE OF input_tokens,cached_input_tokens,output_tokens,reasoning_output_tokens,total_tokens,estimated_cost_usd ON request_token_stats BEGIN
    INSERT INTO usage_daily_rollups(day,key_id,input_tokens,cached_input_tokens,output_tokens,reasoning_output_tokens,total_tokens,estimated_cost_usd)
    VALUES (date(COALESCE((SELECT created_at FROM request_logs WHERE id=OLD.request_log_id),OLD.created_at),'unixepoch','localtime'),COALESCE(NULLIF(TRIM((SELECT key_id FROM request_logs WHERE id=OLD.request_log_id)),''),TRIM(OLD.key_id),''),-(MAX(IFNULL(OLD.input_tokens,0),0)),-(MIN(MAX(IFNULL(OLD.cached_input_tokens,0),0),MAX(IFNULL(OLD.input_tokens,0),0))),-(MAX(IFNULL(OLD.output_tokens,0),0)),-(MAX(IFNULL(OLD.reasoning_output_tokens,0),0)),-(MAX(COALESCE(OLD.total_tokens,IFNULL(OLD.input_tokens,0)+IFNULL(OLD.output_tokens,0)),0)),-(MAX(IFNULL(OLD.estimated_cost_usd,0),0)))
    ON CONFLICT(day,key_id) DO UPDATE SET
      input_tokens=usage_daily_rollups.input_tokens+excluded.input_tokens,
      cached_input_tokens=usage_daily_rollups.cached_input_tokens+excluded.cached_input_tokens,
      output_tokens=usage_daily_rollups.output_tokens+excluded.output_tokens,
      reasoning_output_tokens=usage_daily_rollups.reasoning_output_tokens+excluded.reasoning_output_tokens,
      total_tokens=usage_daily_rollups.total_tokens+excluded.total_tokens,
      estimated_cost_usd=usage_daily_rollups.estimated_cost_usd+excluded.estimated_cost_usd;
    INSERT INTO usage_daily_rollups(day,key_id,input_tokens,cached_input_tokens,output_tokens,reasoning_output_tokens,total_tokens,estimated_cost_usd)
    VALUES (date(COALESCE((SELECT created_at FROM request_logs WHERE id=NEW.request_log_id),NEW.created_at),'unixepoch','localtime'),COALESCE(NULLIF(TRIM((SELECT key_id FROM request_logs WHERE id=NEW.request_log_id)),''),TRIM(NEW.key_id),''),MAX(IFNULL(NEW.input_tokens,0),0),MIN(MAX(IFNULL(NEW.cached_input_tokens,0),0),MAX(IFNULL(NEW.input_tokens,0),0)),MAX(IFNULL(NEW.output_tokens,0),0),MAX(IFNULL(NEW.reasoning_output_tokens,0),0),MAX(COALESCE(NEW.total_tokens,IFNULL(NEW.input_tokens,0)+IFNULL(NEW.output_tokens,0)),0),MAX(IFNULL(NEW.estimated_cost_usd,0),0))
    ON CONFLICT(day,key_id) DO UPDATE SET
      input_tokens=usage_daily_rollups.input_tokens+excluded.input_tokens,
      cached_input_tokens=usage_daily_rollups.cached_input_tokens+excluded.cached_input_tokens,
      output_tokens=usage_daily_rollups.output_tokens+excluded.output_tokens,
      reasoning_output_tokens=usage_daily_rollups.reasoning_output_tokens+excluded.reasoning_output_tokens,
      total_tokens=usage_daily_rollups.total_tokens+excluded.total_tokens,
      estimated_cost_usd=usage_daily_rollups.estimated_cost_usd+excluded.estimated_cost_usd;
END;

