ALTER TABLE prompt_templates
    ADD COLUMN active_template_key VARCHAR(100)
        GENERATED ALWAYS AS (CASE WHEN active THEN template_key ELSE NULL END) STORED,
    ADD CONSTRAINT uq_prompt_single_active UNIQUE (active_template_key);

ALTER TABLE section_standard_evaluations
    ADD COLUMN prompt_fingerprint VARCHAR(64) NULL;
