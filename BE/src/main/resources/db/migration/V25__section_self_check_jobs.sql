ALTER TABLE ai_evaluation_jobs
    DROP CHECK chk_ai_evaluation_jobs_kind,
    ADD CONSTRAINT chk_ai_evaluation_jobs_kind
        CHECK (kind IN (
            'SECTION_CITATION_REVIEW', 'SECTION_SUGGESTION',
            'SOURCE_MATCHES', 'TRACE_RECHECK', 'SECTION_SELF_CHECK'
        ));
