UPDATE paper_sections
SET assigned_user_id = NULL,
    handoff_confirmed_by = NULL,
    handoff_confirmed_at = NULL,
    handoff_content_version = NULL,
    handoff_input_fingerprint = NULL
WHERE LOWER(TRIM(section_title)) IN
      ('reference', 'references', 'bibliography', 'works cited');
