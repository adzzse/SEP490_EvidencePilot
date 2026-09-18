-- V38: immutable first-handoff baseline per section.
-- Captured once when a section is first handed to Student work (assignment).
-- Reassignment, unassign, and project-member changes never alter the row:
-- insert-if-absent keyed by UNIQUE(project_id, section_id). No backfill —
-- assignment-time content of legacy projects cannot be reconstructed honestly;
-- their absence surfaces as "comparison baseline unavailable", never as invented data.
CREATE TABLE assignment_section_baselines (
    id BINARY(16) NOT NULL PRIMARY KEY,
    project_id BINARY(16) NOT NULL,
    section_id BINARY(16) NOT NULL,
    content_tex LONGTEXT NOT NULL,
    content_version INT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT NOW(6),
    CONSTRAINT fk_asb_project FOREIGN KEY (project_id)
        REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_asb_section FOREIGN KEY (section_id)
        REFERENCES paper_sections(id) ON DELETE CASCADE,
    CONSTRAINT uq_asb_project_section UNIQUE (project_id, section_id),
    INDEX idx_asb_lookup (project_id, section_id, created_at)
);
