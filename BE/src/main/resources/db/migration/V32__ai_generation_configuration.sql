CREATE TABLE ai_generation_config (
    id BIGINT NOT NULL PRIMARY KEY,
    revision BIGINT NOT NULL DEFAULT 0,
    source VARCHAR(30),
    provider VARCHAR(100),
    model_ids_json JSON,
    catalog_fingerprint VARCHAR(64),
    updated_by BINARY(16),
    updated_at DATETIME,
    CONSTRAINT chk_ai_generation_config_singleton CHECK (id = 1),
    CONSTRAINT chk_ai_generation_config_revision CHECK (revision >= 0),
    CONSTRAINT fk_ai_generation_config_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)
);

INSERT INTO ai_generation_config (id, revision) VALUES (1, 0);

ALTER TABLE section_standard_evaluations
    ADD COLUMN generation_fingerprint VARCHAR(64) NULL,
    ADD COLUMN generation_provider VARCHAR(100) NULL,
    ADD COLUMN generation_model VARCHAR(255) NULL;
