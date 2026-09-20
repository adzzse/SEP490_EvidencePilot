ALTER TABLE paper_sections
    ADD COLUMN section_kind VARCHAR(20) NOT NULL DEFAULT 'STANDARD';

UPDATE paper_sections
SET section_kind = 'REFERENCE'
WHERE LOWER(TRIM(section_title)) IN ('reference', 'references', 'bibliography', 'works cited');
