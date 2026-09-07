-- V26: backend-owned audit severity.
-- New rows get their severity from AuditService (action -> severity map).
-- Existing rows are backfilled with the same rules so history stays filterable.

ALTER TABLE audit_logs
    ADD COLUMN severity VARCHAR(20) NOT NULL DEFAULT 'INFO';

UPDATE audit_logs
    SET severity = 'CRITICAL'
    WHERE action LIKE '%_BANNED'
       OR action LIKE '%_DELETED'
       OR action LIKE '%_FAILED';

UPDATE audit_logs
    SET severity = 'WARN'
    WHERE severity = 'INFO'
      AND (action LIKE '%_EXPIRED'
        OR action LIKE '%_REJECTED'
        OR action LIKE '%_RETURNED'
        OR action = 'PASSWORD_RESET_REQUESTED');

CREATE INDEX idx_audit_severity ON audit_logs (severity);
