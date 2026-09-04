ALTER TABLE section_standard_evaluations
    MODIFY COLUMN pass_threshold INT NULL;

ALTER TABLE paper_sections
    ADD COLUMN handoff_confirmed_by BINARY(16) NULL,
    ADD COLUMN handoff_confirmed_at DATETIME(6) NULL,
    ADD COLUMN handoff_content_version INT NULL,
    ADD COLUMN handoff_input_fingerprint VARCHAR(64) NULL,
    ADD CONSTRAINT fk_paper_section_handoff_user
        FOREIGN KEY (handoff_confirmed_by) REFERENCES users(id);

CREATE INDEX idx_paper_sections_handoff_user
    ON paper_sections(handoff_confirmed_by);

ALTER TABLE feedback_requests
    ADD COLUMN submission_snapshot_json LONGTEXT NULL;
