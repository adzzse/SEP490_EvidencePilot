-- V37: independent review snapshots (Task A) + student ack toggle (Task B).
-- No pending feedback_replies migration to delete: V27 created it, V34 altered
-- it, V35/V36 are attachments-only. Applied history is immutable; only ADD here.

-- 1. Independent per-section snapshots, decoupled from checkpoints/save history.
-- BASELINE = sections frozen at "Return for Revision"; SUBMITTED = sections at
-- "Submit for Review". Historical rows are seeded by V37_1__SeedReviewSnapshots
-- (Java migration: JSON parsing + UUID casts are unsafe in pure SQL).
CREATE TABLE review_section_snapshots (
    id BINARY(16) NOT NULL PRIMARY KEY,
    request_id BINARY(16) NOT NULL,
    section_id BINARY(16) NOT NULL,
    content_tex LONGTEXT NOT NULL,
    content_version INT NULL,
    snapshot_type VARCHAR(10) NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT NOW(6),
    CONSTRAINT fk_rss_request FOREIGN KEY (request_id)
        REFERENCES feedback_requests(id) ON DELETE CASCADE,
    CONSTRAINT fk_rss_section FOREIGN KEY (section_id)
        REFERENCES paper_sections(id) ON DELETE CASCADE,
    CONSTRAINT chk_rss_type CHECK (snapshot_type IN ('BASELINE', 'SUBMITTED')),
    CONSTRAINT uq_rss_request_section_type UNIQUE (request_id, section_id, snapshot_type),
    INDEX idx_rss_request (request_id, snapshot_type)
);

-- 2. Squashed feedback loop: the student never RESOLVEs (instructor-only via
-- thread_state). They claim IMPLEMENTED (fixed) or WONT_FIX (refuse + justify).
ALTER TABLE instructor_feedbacks
    ADD COLUMN student_status VARCHAR(12) NULL AFTER pending_state_opt_version,
    ADD COLUMN student_note TEXT NULL AFTER student_status,
    ADD CONSTRAINT chk_instructor_feedback_student_status
        CHECK (student_status IS NULL OR student_status IN ('IMPLEMENTED', 'WONT_FIX'));
