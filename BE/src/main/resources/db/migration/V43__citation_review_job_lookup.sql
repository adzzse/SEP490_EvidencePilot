ALTER TABLE ai_evaluation_jobs
    ADD COLUMN document_id BINARY(16) NULL,
    ADD COLUMN section_id BINARY(16) NULL,
    ADD COLUMN input_fingerprint VARCHAR(64) NULL;

CREATE INDEX idx_ai_jobs_section_review_lookup
    ON ai_evaluation_jobs(
        project_id, kind, document_id, section_id, input_fingerprint, created_at);
