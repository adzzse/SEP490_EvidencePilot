CREATE TABLE section_standard_evaluations (
    id BINARY(16) NOT NULL PRIMARY KEY,
    section_id BINARY(16) NOT NULL,
    document_id BINARY(16) NOT NULL,
    project_id BINARY(16) NOT NULL,
    input_fingerprint VARCHAR(64) NOT NULL,
    pass_threshold INT NOT NULL,
    status VARCHAR(20) NOT NULL,
    score_percent INT,
    result_json LONGTEXT,
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_std_eval_section (section_id),
    INDEX idx_std_eval_doc (document_id),
    INDEX idx_std_eval_project (project_id),
    FOREIGN KEY (section_id) REFERENCES paper_sections(id) ON DELETE CASCADE,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

ALTER TABLE feedback_requests
    ADD COLUMN flagged BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN standard_snapshot_json LONGTEXT;
