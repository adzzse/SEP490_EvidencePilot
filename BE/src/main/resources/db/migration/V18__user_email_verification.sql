-- ==========================================
-- 18. USER EMAIL VERIFICATION
-- ==========================================
ALTER TABLE users
    ADD COLUMN pending_email VARCHAR(255) NULL AFTER email,
    ADD COLUMN email_verification_token_hash VARCHAR(255) NULL AFTER password_reset_requested_at,
    ADD COLUMN email_verification_token_expires_at DATETIME NULL AFTER email_verification_token_hash,
    ADD COLUMN email_verification_requested_at DATETIME NULL AFTER email_verification_token_expires_at;

CREATE UNIQUE INDEX idx_users_email_verification_token_hash
    ON users (email_verification_token_hash);
