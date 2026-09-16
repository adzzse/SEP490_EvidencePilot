-- V34: text-anchored review threads — state machine, reply cycles, attachments.
-- Eradicates DONE (migrated to RESOLVED, no coexistence window).

-- 1. DONE -> RESOLVED data migration (must run before the CHECK swap).
UPDATE instructor_feedbacks SET thread_state = 'RESOLVED' WHERE thread_state = 'DONE';
UPDATE instructor_feedbacks SET pending_state = 'RESOLVED' WHERE pending_state = 'DONE';

-- 2. Widen the state machine to OPEN / RESOLVED / REJECTED.
ALTER TABLE instructor_feedbacks
    DROP CHECK chk_instructor_feedback_thread_state,
    DROP CHECK chk_instructor_feedback_pending_state;
ALTER TABLE instructor_feedbacks
    ADD CONSTRAINT chk_instructor_feedback_thread_state
        CHECK (thread_state IN ('OPEN', 'RESOLVED', 'REJECTED')),
    ADD CONSTRAINT chk_instructor_feedback_pending_state
        CHECK (pending_state IS NULL OR pending_state IN ('OPEN', 'RESOLVED', 'REJECTED'));

-- 3. Scope replies to an explicit review cycle (V27 created the table without it).
ALTER TABLE feedback_replies
    ADD COLUMN request_id BINARY(16) NULL AFTER published_request_id,
    ADD CONSTRAINT fk_feedback_replies_request
        FOREIGN KEY (request_id) REFERENCES feedback_requests(id) ON DELETE SET NULL,
    ADD INDEX idx_feedback_replies_request (feedback_id, request_id);

-- Backfill the cycle from the publish reference; rows without either stay NULL
-- (pre-snapshot legacy rows) and are treated as belonging to the root's request.
UPDATE feedback_replies
SET request_id = published_request_id
WHERE request_id IS NULL AND published_request_id IS NOT NULL;

-- 4. Scope idempotency to (thread, author): a bare (feedback_id, idempotency_key)
-- unique key is replayable across users.
ALTER TABLE feedback_replies
    DROP INDEX uq_feedback_replies_idempotency;
ALTER TABLE feedback_replies
    ADD CONSTRAINT uq_feedback_replies_idempotency
        UNIQUE (feedback_id, author_id, idempotency_key);

-- 5. Feedback attachments (bytes live in MinIO; rows reference thread or reply).
CREATE TABLE feedback_attachments (
    id BINARY(16) NOT NULL PRIMARY KEY,
    feedback_id BINARY(16) NOT NULL,
    reply_id BINARY(16) NULL,
    project_id BINARY(16) NOT NULL,
    storage_key VARCHAR(500) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    uploaded_by BINARY(16) NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT NOW(6),
    CONSTRAINT fk_fb_att_feedback
        FOREIGN KEY (feedback_id) REFERENCES instructor_feedbacks(id) ON DELETE CASCADE,
    CONSTRAINT fk_fb_att_reply
        FOREIGN KEY (reply_id) REFERENCES feedback_replies(id) ON DELETE CASCADE,
    CONSTRAINT fk_fb_att_project
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_fb_att_uploaded_by
        FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT chk_fb_att_size CHECK (file_size_bytes > 0 AND file_size_bytes <= 10485760),
    INDEX idx_fb_att_feedback (feedback_id),
    INDEX idx_fb_att_reply (reply_id)
);
