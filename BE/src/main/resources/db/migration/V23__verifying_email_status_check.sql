-- 23. Widen the users account_status CHECK to include VERIFYING_EMAIL.
--
-- V1 declared the check inline, so MySQL auto-named it users_chk_2
-- (users_chk_1 is the role check on the same table). V22 added the
-- VERIFYING_EMAIL flow but never widened the check, so persisting a
-- verifying user fails with "Check constraint 'users_chk_2' is violated".
-- Re-create it under an explicit name covering all AccountStatus values.
ALTER TABLE users DROP CHECK users_chk_2;
ALTER TABLE users ADD CONSTRAINT chk_users_account_status
    CHECK (account_status IN ('PENDING', 'ACTIVE', 'BANNED', 'DELETED', 'VERIFYING_EMAIL'));
