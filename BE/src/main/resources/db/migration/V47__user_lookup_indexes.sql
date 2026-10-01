-- 47. User lookup index hygiene (measured on live schema 2026-10-01).
--
-- 1) V22 declared email_verification_token twice: once inline UNIQUE
--    (auto-named key `email_verification_token`) and once as explicit
--    UNIQUE INDEX idx_users_email_verification_token. Both enforce the same
--    single-column uniqueness; the second costs storage and doubles the
--    uniqueness check on every invitation issue/accept. Drop the auto-named
--    key, keep the explicitly named one.
ALTER TABLE users DROP INDEX email_verification_token;

-- 2) The login/lookup predicate (WHERE email = ? AND account_status <>
--    'DELETED') cannot use the functional partial index
--    idx_users_email_active (it is keyed on the CASE expression, not on
--    email). Live EXPLAIN showed type=ALL with possible_keys=NULL on users.
--    A plain non-unique index serves the hot lookup while the partial UNIQUE
--    index keeps enforcing active-email uniqueness (DELETED rows may repeat).
CREATE INDEX idx_users_email_lookup ON users (email);
