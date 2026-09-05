-- ==========================================
-- 22. VERIFYING-EMAIL INVITATION FLOW
-- ==========================================
-- email_verification_token: secure random invite token (UNIQUE), consumed by
-- POST /api/auth/set-password. Coexists with the V18
-- email_verification_token_hash* columns, which serve the change-email flow.
-- email_verification_expires_at: invitation TTL (24h). The scheduled job flips
-- expired rows to PENDING (hygiene only) — the set-password endpoint always
-- re-validates expiry at request time, never trusting the background job.
ALTER TABLE users
    ADD COLUMN email_verification_token VARCHAR(255) NULL UNIQUE AFTER email_verification_requested_at,
    ADD COLUMN email_verification_expires_at DATETIME NULL AFTER email_verification_token;

CREATE UNIQUE INDEX idx_users_email_verification_token
    ON users (email_verification_token);
