-- V29: versioned AI prompt templates (read-only + explicit activate).
-- SYSTEM prompts stay in code; DB holds reviewable drafts. Active row per key at most (enforced in service txn).

CREATE TABLE prompt_templates (
    id BINARY(16) NOT NULL PRIMARY KEY,
    template_key VARCHAR(100) NOT NULL COMMENT 'CITATION_REVIEW | CHECK_STANDARD',
    version VARCHAR(50) NOT NULL,
    system_text LONGTEXT NOT NULL,
    json_schema JSON NULL,
    model VARCHAR(100) NULL COMMENT 'display hint only — never drives AiModelCallGate routing',
    active BOOLEAN NOT NULL DEFAULT FALSE,
    created_by BINARY(16) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE INDEX uq_prompt_key_version (template_key, version),
    INDEX idx_prompt_active (template_key, active),
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);
