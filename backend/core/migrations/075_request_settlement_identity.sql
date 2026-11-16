-- Historical rows remain unchanged; new finalizations receive a server-derived identity.
ALTER TABLE request_logs ADD COLUMN settlement_key TEXT;
CREATE UNIQUE INDEX idx_request_logs_settlement_key
    ON request_logs(settlement_key) WHERE settlement_key IS NOT NULL;
CREATE INDEX idx_wallet_request_charge
    ON app_wallet_ledger_entries(request_log_id)
    WHERE entry_kind = 'request_charge' AND request_log_id IS NOT NULL;
