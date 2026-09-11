-- V30: AST ingestion — document_metadata + section hierarchy + gap ordering.
-- MySQL JSON is a binary store (no JSONB on MySQL); the column type itself
-- rejects malformed JSON. The CHECK below additionally pins the authors
-- payload shape so a bad ingest script fails loudly instead of crashing
-- frontend list rendering. (JSON_SCHEMA_VALID requires MySQL >= 8.0.17.)
CREATE TABLE document_metadata (
    id BINARY(16) NOT NULL PRIMARY KEY,
    document_id BINARY(16) NOT NULL UNIQUE,
    title VARCHAR(1000),
    authors_json JSON NOT NULL,
    keywords VARCHAR(1000),
    extraction_source VARCHAR(50) NOT NULL DEFAULT 'blocks',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_document_metadata_authors CHECK (
        JSON_SCHEMA_VALID(
            '{"type": "array", "items": {"type": "object", "required": ["name"], "properties": {
                "name": {"type": "string", "minLength": 1, "maxLength": 500},
                "affiliations": {"type": "array", "items": {"type": "string", "maxLength": 500}},
                "emails": {"type": "array", "items": {"type": "string", "maxLength": 320}}}}}',
            authors_json)),
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

-- Hierarchy: parent links the AST; heading_level keeps H2/H3/H4 distinct;
-- source_block_* records the extraction.json span for RAG alignment.
-- Existing rows stay flat roots (heading_level 2); their dense 0..N-1 orders
-- remain legal — gaps are allowed, contiguity is not required.
ALTER TABLE paper_sections
    ADD COLUMN parent_section_id BINARY(16) NULL AFTER document_id,
    ADD COLUMN heading_level INT NOT NULL DEFAULT 2 AFTER section_title,
    ADD COLUMN source_block_start INT NULL AFTER heading_level,
    ADD COLUMN source_block_end INT NULL AFTER source_block_start,
    ADD CONSTRAINT fk_paper_sections_parent
        FOREIGN KEY (parent_section_id) REFERENCES paper_sections(id) ON DELETE CASCADE;

CREATE INDEX idx_paper_sections_tree
    ON paper_sections(document_id, parent_section_id, section_order);
