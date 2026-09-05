-- ==========================================
-- 20. EMAIL OTP TOKENS + CLAIMS
-- ==========================================
-- EmailOtpToken: 6-digit verification code with TTL + attempt counter.
-- EmailOtpClaim:  one-shot token issued after a successful verify, consumed
--                 by PUT /api/users/profile when the user actually saves.
-- ponytail: rows older than 24h are tiny in practice; add a nightly cleanup
-- job if these tables grow. Indexes kept minimal (the lookup pattern is
-- always the latest unverified row for one (user, email)).

CREATE TABLE email_otp_tokens (
    id              BINARY(16)   NOT NULL,
    user_id         BINARY(16)   NOT NULL,
    email           VARCHAR(255) NOT NULL,
    code_hash       VARCHAR(64)  NOT NULL,
    attempts        INT          NOT NULL DEFAULT 0,
    expires_at      DATETIME(6)  NOT NULL,
    cooldown_until  DATETIME(6)  NULL,
    verified_at     DATETIME(6)  NULL,
    created_at      DATETIME(6)  NOT NULL,
    PRIMARY KEY (id),
    KEY idx_otp_user_email (user_id, email, created_at),
    CONSTRAINT fk_otp_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE email_otp_claims (
    token_hash    VARCHAR(64)  NOT NULL,
    user_id       BINARY(16)   NOT NULL,
    email         VARCHAR(255) NOT NULL,
    expires_at    DATETIME(6)  NOT NULL,
    consumed_at   DATETIME(6)  NULL,
    created_at    DATETIME(6)  NOT NULL,
    PRIMARY KEY (token_hash),
    KEY idx_claim_user (user_id),
    CONSTRAINT fk_claim_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
