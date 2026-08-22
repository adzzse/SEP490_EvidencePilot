CREATE INDEX idx_audit_report_range
    ON audit_logs (action, entity_type, entity_id, occurred_at);
