-- ==========================================
-- 21. USER AVATAR (MinIO object key only)
-- ==========================================
-- avatar_key stores ONLY the MinIO object key (e.g. avatars/{userId}.jpg).
-- The backend constructs the full URL (presigned) at read time in
-- UserResponse — never persist a URL here (no hardcoded domains).
ALTER TABLE users
    ADD COLUMN avatar_key VARCHAR(512) NULL AFTER student_code;
