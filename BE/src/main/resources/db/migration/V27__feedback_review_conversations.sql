ALTER TABLE instructor_feedbacks
    ADD COLUMN published_at DATETIME(6) NULL,
    ADD COLUMN thread_state VARCHAR(10) NOT NULL DEFAULT 'OPEN',
    ADD COLUMN state_changed_at DATETIME(6) NULL,
    ADD COLUMN state_changed_by BINARY(16) NULL,
    ADD COLUMN pending_state VARCHAR(10) NULL,
    ADD COLUMN pending_state_opt_version BIGINT NULL,
    ADD CONSTRAINT fk_instructor_feedback_state_changed_by
        FOREIGN KEY (state_changed_by) REFERENCES users(id) ON DELETE SET NULL,
    ADD CONSTRAINT chk_instructor_feedback_thread_state
        CHECK (thread_state IN ('OPEN', 'DONE')),
    ADD CONSTRAINT chk_instructor_feedback_pending_state
        CHECK (pending_state IS NULL OR pending_state IN ('OPEN', 'DONE'));

UPDATE instructor_feedbacks
SET published_at = COALESCE(updated_at, created_at, NOW(6))
WHERE published_at IS NULL;

CREATE TABLE feedback_replies (
    id BINARY(16) NOT NULL PRIMARY KEY,
    feedback_id BINARY(16) NOT NULL,
    author_id BINARY(16) NULL,
    author_role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME(6) NOT NULL,
    published_at DATETIME(6) NULL,
    published_request_id BINARY(16) NULL,
    idempotency_key BINARY(16) NULL,
    CONSTRAINT fk_feedback_replies_feedback
        FOREIGN KEY (feedback_id) REFERENCES instructor_feedbacks(id) ON DELETE CASCADE,
    CONSTRAINT fk_feedback_replies_author
        FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_feedback_replies_published_request
        FOREIGN KEY (published_request_id) REFERENCES feedback_requests(id) ON DELETE SET NULL,
    CONSTRAINT chk_feedback_replies_author_role
        CHECK (author_role IN ('STUDENT', 'INSTRUCTOR', 'ADMIN', 'UNKNOWN')),
    CONSTRAINT uq_feedback_replies_idempotency UNIQUE (feedback_id, idempotency_key),
    INDEX idx_feedback_replies_feedback_created (feedback_id, created_at)
);

INSERT INTO feedback_replies (
    id, feedback_id, author_id, author_role, content, created_at, published_at, published_request_id
)
SELECT UUID_TO_BIN(UUID()), feedback.id, feedback.updated_by,
       CASE user_record.role
           WHEN 'STUDENT' THEN 'STUDENT'
           WHEN 'INSTRUCTOR' THEN 'INSTRUCTOR'
           WHEN 'ADMIN' THEN 'ADMIN'
           ELSE 'UNKNOWN'
       END,
       feedback.answer_content,
       COALESCE(feedback.answered_at, feedback.updated_at, feedback.created_at, NOW(6)),
       COALESCE(feedback.answered_at, feedback.updated_at, feedback.created_at, NOW(6)),
       feedback.request_id
FROM instructor_feedbacks feedback
LEFT JOIN users user_record ON user_record.id = feedback.updated_by
WHERE feedback.answer_content IS NOT NULL
  AND TRIM(feedback.answer_content) <> '';

ALTER TABLE system_notifications
    ADD COLUMN feedback_id BINARY(16) NULL,
    ADD INDEX idx_system_notifications_feedback (feedback_id);
