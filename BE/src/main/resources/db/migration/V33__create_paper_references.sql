CREATE TABLE paper_references (
    id BINARY(16) NOT NULL PRIMARY KEY,
    paper_id BINARY(16) NOT NULL,
    source_id BINARY(16) NOT NULL,
    added_by BINARY(16) NOT NULL,
    added_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT uk_paper_reference UNIQUE (paper_id, source_id),
    INDEX ix_paper_reference_order (paper_id, added_at),
    CONSTRAINT fk_paper_reference_paper FOREIGN KEY (paper_id)
        REFERENCES documents(id) ON DELETE CASCADE,
    CONSTRAINT fk_paper_reference_source FOREIGN KEY (source_id)
        REFERENCES documents(id) ON DELETE CASCADE,
    CONSTRAINT fk_paper_reference_added_by FOREIGN KEY (added_by)
        REFERENCES users(id) ON DELETE CASCADE
);

-- Backfill explicit paper References from machine-generated ep<uuid32> citation
-- keys already present in active paper sections. Only keys that resolve to an
-- active SOURCE visible to the same project (direct ownership or
-- project_documents link) are registered. Manual bibliography text is untouched.
INSERT IGNORE INTO paper_references (id, paper_id, source_id, added_by, added_at)
WITH RECURSIVE section_text AS (
    SELECT d.id AS paper_id, d.project_id, d.uploaded_by,
           REGEXP_REPLACE(ps.content_tex, '(?m)(?<!\\\\)%[^\\r\\n]*', '') AS content
    FROM documents d
    JOIN paper_sections ps ON ps.document_id = d.id AND ps.active = TRUE
    WHERE d.doc_type = 'PAPER' AND d.active = TRUE
), cite_occurrences (paper_id, project_id, uploaded_by, content, occurrence, cite_text) AS (
    SELECT paper_id, project_id, uploaded_by, content, 1,
           REGEXP_SUBSTR(content, '\\\\cite(\\[[^]]*\\])?\\{[^}]+\\}', 1, 1)
    FROM section_text
    WHERE REGEXP_SUBSTR(content, '\\\\cite(\\[[^]]*\\])?\\{[^}]+\\}', 1, 1) IS NOT NULL
    UNION ALL
    SELECT paper_id, project_id, uploaded_by, content, occurrence + 1,
           REGEXP_SUBSTR(content, '\\\\cite(\\[[^]]*\\])?\\{[^}]+\\}', 1, occurrence + 1)
    FROM cite_occurrences
    WHERE REGEXP_SUBSTR(content, '\\\\cite(\\[[^]]*\\])?\\{[^}]+\\}', 1, occurrence + 1) IS NOT NULL
), key_occurrences (paper_id, project_id, uploaded_by, content, occurrence, citation_key) AS (
    SELECT paper_id, project_id, uploaded_by, cite_text, 1,
           REGEXP_SUBSTR(cite_text, '(?<=[{,[:space:]])ep[0-9A-Fa-f]{32}(?=[},[:space:]])', 1, 1)
    FROM cite_occurrences
    WHERE REGEXP_SUBSTR(cite_text, '(?<=[{,[:space:]])ep[0-9A-Fa-f]{32}(?=[},[:space:]])', 1, 1) IS NOT NULL
    UNION ALL
    SELECT paper_id, project_id, uploaded_by, content, occurrence + 1,
           REGEXP_SUBSTR(content, '(?<=[{,[:space:]])ep[0-9A-Fa-f]{32}(?=[},[:space:]])', 1, occurrence + 1)
    FROM key_occurrences
    WHERE REGEXP_SUBSTR(content, '(?<=[{,[:space:]])ep[0-9A-Fa-f]{32}(?=[},[:space:]])', 1, occurrence + 1) IS NOT NULL
)
SELECT UUID_TO_BIN(UUID()), k.paper_id, s.id, k.uploaded_by,
       TIMESTAMPADD(MICROSECOND, ROW_NUMBER() OVER (PARTITION BY k.paper_id ORDER BY k.citation_key), CURRENT_TIMESTAMP(6))
FROM (SELECT DISTINCT paper_id, project_id, uploaded_by, citation_key
      FROM key_occurrences) k
JOIN documents s
  ON s.id = UUID_TO_BIN(CONCAT(
         SUBSTRING(k.citation_key, 3, 8), '-', SUBSTRING(k.citation_key, 11, 4), '-',
         SUBSTRING(k.citation_key, 15, 4), '-', SUBSTRING(k.citation_key, 19, 4), '-',
         SUBSTRING(k.citation_key, 23, 12)))
 AND s.doc_type = 'SOURCE' AND s.active = TRUE
WHERE s.project_id = k.project_id
   OR EXISTS (SELECT 1 FROM project_documents pd
             WHERE pd.project_id = k.project_id AND pd.document_id = s.id);
