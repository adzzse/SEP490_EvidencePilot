-- EvidencePilot consolidated MySQL schema snapshot.
--
-- Runtime source of truth: db/migration/V1__baseline_schema.sql through V39__*.sql
-- (plus V37_1__SeedReviewSnapshots.java for data-only backfill). This file is a
-- DDL snapshot for inspection, local bootstrap, and diagram generation; it does
-- not replay migration backfills or seed data.
--
-- Tested dialect: MySQL 8.x / InnoDB.

SET NAMES utf8mb4;

CREATE TABLE users (
    id BINARY(16) NOT NULL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    pending_email VARCHAR(255),
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    account_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    student_code VARCHAR(50),
    avatar_key VARCHAR(512),
    password_change_notice_pending BOOLEAN NOT NULL DEFAULT FALSE,
    password_reset_token_hash VARCHAR(255) UNIQUE,
    password_reset_token_expires_at DATETIME,
    password_reset_requested_at DATETIME,
    email_verification_token_hash VARCHAR(255),
    email_verification_token_expires_at DATETIME,
    email_verification_requested_at DATETIME,
    email_verification_token VARCHAR(255) UNIQUE,
    email_verification_expires_at DATETIME,
    token_version INT NOT NULL DEFAULT 0,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_users_role CHECK (role IN ('STUDENT', 'INSTRUCTOR', 'ADMIN')),
    CONSTRAINT chk_users_account_status CHECK (account_status IN ('PENDING', 'ACTIVE', 'BANNED', 'DELETED', 'VERIFYING_EMAIL'))
);

CREATE UNIQUE INDEX idx_users_email_active
    ON users ((CASE WHEN account_status = 'DELETED' THEN NULL ELSE email END));
CREATE UNIQUE INDEX idx_users_student_code_active
    ON users ((CASE WHEN account_status = 'DELETED' THEN NULL ELSE student_code END));
CREATE UNIQUE INDEX idx_users_email_verification_token_hash
    ON users (email_verification_token_hash);

CREATE TABLE projects (
    id BINARY(16) NOT NULL PRIMARY KEY,
    opt_version BIGINT NOT NULL DEFAULT 0,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) NOT NULL,
    target_standard VARCHAR(50),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_projects_status CHECK (status IN ('CREATED', 'ASSIGNED', 'IN_PROGRESS', 'SUBMITTED_FOR_REVIEW', 'RETURNED', 'APPROVED', 'ARCHIVED')),
    CONSTRAINT chk_projects_target_standard CHECK (target_standard IS NULL OR target_standard IN ('IEEE', 'ACM', 'SPRINGER_LNCS', 'APA', 'MLA', 'CUSTOM'))
);

CREATE TABLE project_members (
    id BINARY(16) NOT NULL PRIMARY KEY,
    project_id BINARY(16) NOT NULL,
    user_id BINARY(16) NOT NULL,
    role VARCHAR(50) NOT NULL,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE INDEX idx_project_members_unique (project_id, user_id),
    CONSTRAINT chk_project_members_role CHECK (role IN ('LEADER', 'MEMBER', 'INSTRUCTOR')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE collection_categories (
    id BINARY(16) NOT NULL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE collections (
    id BINARY(16) NOT NULL PRIMARY KEY,
    instructor_id BINARY(16) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category_id BINARY(16),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (instructor_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES collection_categories(id) ON DELETE SET NULL
);

CREATE TABLE documents (
    id BINARY(16) NOT NULL PRIMARY KEY,
    opt_version BIGINT NOT NULL DEFAULT 0,
    project_id BINARY(16),
    collection_id BINARY(16),
    uploaded_by BINARY(16) NOT NULL,
    doc_type VARCHAR(50) NOT NULL,
    file_url VARCHAR(500) NOT NULL,
    original_filename VARCHAR(255),
    content_type VARCHAR(255),
    file_size_bytes BIGINT,
    file_hash_sha256 VARCHAR(64),
    processing_status VARCHAR(50) NOT NULL,
    processing_error TEXT,
    chunk_count INT DEFAULT 0,
    processed_at DATETIME,
    published_at DATETIME,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    doi VARCHAR(255),
    title VARCHAR(500),
    authors TEXT,
    publication_year INT,
    publisher VARCHAR(255),
    openalex_topic VARCHAR(255),
    openalex_subfield VARCHAR(255),
    openalex_field VARCHAR(255),
    openalex_domain VARCHAR(255),
    cited_by_count INT,
    extraction_quality JSON,
    download_token VARCHAR(36) NOT NULL,
    preamble_tex LONGTEXT,
    front_matter_tex LONGTEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_documents_project_id (project_id),
    INDEX idx_documents_collection_id (collection_id),
    INDEX idx_documents_file_hash_sha256 (file_hash_sha256),
    INDEX idx_documents_processing_status (processing_status),
    CONSTRAINT chk_documents_doc_type CHECK (doc_type IN ('PAPER', 'SOURCE')),
    CONSTRAINT chk_documents_processing_status CHECK (processing_status IN ('PENDING_UPLOAD', 'UPLOADED', 'METADATA_FETCHED', 'PDF_DOWNLOADED', 'QUEUED', 'PROCESSING', 'RAW_EXTRACTED', 'PARTIAL', 'READY', 'COMPLETED', 'FAILED')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
    FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE SET NULL,
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE document_texts (
    id BINARY(16) NOT NULL PRIMARY KEY,
    document_id BINARY(16) NOT NULL UNIQUE,
    extracted_text LONGTEXT NOT NULL,
    extraction_method VARCHAR(50) NOT NULL,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE TABLE document_chunks (
    id BINARY(16) NOT NULL PRIMARY KEY,
    document_id BINARY(16) NOT NULL,
    chunk_index INT NOT NULL,
    `text` TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT uq_document_chunks_document_index UNIQUE (document_id, chunk_index),
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE TABLE document_references (
    id BINARY(16) NOT NULL PRIMARY KEY,
    document_id BINARY(16) NOT NULL,
    reference_index INT NOT NULL,
    raw_text TEXT NOT NULL,
    title VARCHAR(255),
    publication_year INT,
    cited_by_count INT,
    doi VARCHAR(255),
    edge_type VARCHAR(50) NOT NULL,
    CONSTRAINT uq_document_references_order UNIQUE (document_id, edge_type, reference_index),
    CONSTRAINT chk_document_references_edge_type CHECK (edge_type IN ('REFERENCES', 'CITED_BY')),
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE TABLE paper_sections (
    id BINARY(16) NOT NULL PRIMARY KEY,
    document_id BINARY(16) NOT NULL,
    parent_section_id BINARY(16),
    assigned_user_id BINARY(16),
    section_order INT NOT NULL,
    section_title VARCHAR(255) NOT NULL,
    heading_level INT NOT NULL DEFAULT 2,
    source_block_start INT,
    source_block_end INT,
    content_tex LONGTEXT NOT NULL,
    previous_content_tex LONGTEXT,
    version INT DEFAULT 1,
    opt_version BIGINT NOT NULL DEFAULT 0,
    content_md_cache LONGTEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    handoff_confirmed_by BINARY(16),
    handoff_confirmed_at DATETIME(6),
    handoff_content_version INT,
    handoff_input_fingerprint VARCHAR(64),
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_paper_sections (document_id, section_order),
    INDEX idx_paper_sections_tree (document_id, parent_section_id, section_order),
    INDEX idx_paper_sections_handoff_user (handoff_confirmed_by),
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_section_id) REFERENCES paper_sections(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_paper_section_handoff_user FOREIGN KEY (handoff_confirmed_by) REFERENCES users(id)
);

CREATE TABLE project_media (
    id BINARY(16) NOT NULL PRIMARY KEY,
    project_id BINARY(16) NOT NULL,
    uploaded_by BINARY(16) NOT NULL,
    storage_key VARCHAR(500) NOT NULL,
    tex_filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100),
    file_size_bytes BIGINT,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE INDEX uq_project_media_storage (project_id, storage_key),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE project_collections (
    id BINARY(16) NOT NULL PRIMARY KEY,
    project_id BINARY(16) NOT NULL,
    collection_id BINARY(16) NOT NULL,
    linked_by BINARY(16) NOT NULL,
    linked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE INDEX idx_project_collections_unique (project_id, collection_id),
    INDEX idx_project_collections_collection (collection_id),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
    FOREIGN KEY (linked_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE project_documents (
    id BINARY(16) NOT NULL PRIMARY KEY,
    project_id BINARY(16) NOT NULL,
    document_id BINARY(16) NOT NULL,
    project_collection_id BINARY(16),
    pinned BOOLEAN NOT NULL DEFAULT TRUE,
    shared_by BINARY(16) NOT NULL,
    shared_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE INDEX idx_project_documents_unique (project_id, document_id),
    INDEX idx_project_documents_collection_link (project_collection_id),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
    FOREIGN KEY (project_collection_id) REFERENCES project_collections(id) ON DELETE SET NULL,
    FOREIGN KEY (shared_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE collection_documents (
    id BINARY(16) NOT NULL PRIMARY KEY,
    collection_id BINARY(16) NOT NULL,
    document_id BINARY(16) NOT NULL,
    added_by BINARY(16) NOT NULL,
    added_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE INDEX idx_collection_documents_unique (collection_id, document_id),
    INDEX idx_collection_documents_document (document_id),
    FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
    FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE feedback_requests (
    id BINARY(16) NOT NULL PRIMARY KEY,
    project_id BINARY(16) NOT NULL,
    student_id BINARY(16) NOT NULL,
    instructor_id BINARY(16) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    section_validation TEXT,
    flagged BOOLEAN NOT NULL DEFAULT FALSE,
    standard_snapshot_json LONGTEXT,
    submission_snapshot_json LONGTEXT,
    requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME,
    CONSTRAINT chk_feedback_requests_status CHECK (status IN ('PENDING', 'RETURNED', 'REVIEWED', 'REJECTED')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (instructor_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE instructor_feedbacks (
    id BINARY(16) NOT NULL PRIMARY KEY,
    request_id BINARY(16) NOT NULL,
    section_id BINARY(16) NOT NULL,
    instructor_id BINARY(16) NOT NULL,
    line_reference VARCHAR(100),
    content TEXT NOT NULL,
    answered BOOLEAN NOT NULL DEFAULT FALSE,
    answer_content TEXT,
    answered_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    section_version INT,
    updated_at DATETIME,
    updated_by BINARY(16),
    anchor_json LONGTEXT,
    opt_version BIGINT NOT NULL DEFAULT 0,
    published_at DATETIME(6),
    thread_state VARCHAR(10) NOT NULL DEFAULT 'OPEN',
    state_changed_at DATETIME(6),
    state_changed_by BINARY(16),
    pending_state VARCHAR(10),
    pending_state_opt_version BIGINT,
    student_status VARCHAR(12),
    student_note TEXT,
    CONSTRAINT chk_instructor_feedback_thread_state CHECK (thread_state IN ('OPEN', 'RESOLVED', 'REJECTED')),
    CONSTRAINT chk_instructor_feedback_pending_state CHECK (pending_state IS NULL OR pending_state IN ('OPEN', 'RESOLVED', 'REJECTED')),
    CONSTRAINT chk_instructor_feedback_student_status CHECK (student_status IS NULL OR student_status IN ('IMPLEMENTED', 'WONT_FIX')),
    FOREIGN KEY (request_id) REFERENCES feedback_requests(id) ON DELETE CASCADE,
    FOREIGN KEY (section_id) REFERENCES paper_sections(id) ON DELETE CASCADE,
    FOREIGN KEY (instructor_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_instructor_feedback_state_changed_by FOREIGN KEY (state_changed_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE feedback_replies (
    id BINARY(16) NOT NULL PRIMARY KEY,
    feedback_id BINARY(16) NOT NULL,
    author_id BINARY(16),
    author_role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME(6) NOT NULL,
    published_at DATETIME(6),
    published_request_id BINARY(16),
    idempotency_key BINARY(16),
    request_id BINARY(16),
    UNIQUE INDEX uq_feedback_replies_idempotency (feedback_id, author_id, idempotency_key),
    INDEX idx_feedback_replies_feedback_created (feedback_id, created_at),
    INDEX idx_feedback_replies_request (feedback_id, request_id),
    CONSTRAINT chk_feedback_replies_author_role CHECK (author_role IN ('STUDENT', 'INSTRUCTOR', 'ADMIN', 'UNKNOWN')),
    FOREIGN KEY (feedback_id) REFERENCES instructor_feedbacks(id) ON DELETE CASCADE,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (published_request_id) REFERENCES feedback_requests(id) ON DELETE SET NULL,
    FOREIGN KEY (request_id) REFERENCES feedback_requests(id) ON DELETE SET NULL
);

CREATE TABLE feedback_attachments (
    id BINARY(16) NOT NULL PRIMARY KEY,
    feedback_id BINARY(16),
    reply_id BINARY(16),
    media_asset_id BINARY(16),
    project_id BINARY(16) NOT NULL,
    storage_key VARCHAR(500) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    uploaded_by BINARY(16) NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT NOW(6),
    INDEX idx_fb_att_feedback (feedback_id),
    INDEX idx_fb_att_reply (reply_id),
    INDEX idx_fb_att_media_asset (media_asset_id),
    CONSTRAINT chk_fb_att_size CHECK (file_size_bytes > 0 AND file_size_bytes <= 10485760),
    CONSTRAINT chk_fb_att_target CHECK (feedback_id IS NOT NULL OR reply_id IS NULL),
    FOREIGN KEY (feedback_id) REFERENCES instructor_feedbacks(id) ON DELETE CASCADE,
    FOREIGN KEY (reply_id) REFERENCES feedback_replies(id) ON DELETE CASCADE,
    FOREIGN KEY (media_asset_id) REFERENCES project_media(id) ON DELETE SET NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE system_notifications (
    id BINARY(16) NOT NULL PRIMARY KEY,
    user_id BINARY(16) NOT NULL,
    actor_id BINARY(16),
    action_type VARCHAR(50) NOT NULL,
    entity_id BINARY(16),
    feedback_id BINARY(16),
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_system_notifications_feedback (feedback_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE export_jobs (
    id BINARY(16) NOT NULL PRIMARY KEY,
    project_id BINARY(16) NOT NULL,
    user_id BINARY(16) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    format VARCHAR(20) NOT NULL DEFAULT 'TEX',
    download_url VARCHAR(1024),
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_export_project (project_id),
    INDEX idx_export_user (user_id),
    INDEX idx_export_status (status),
    CONSTRAINT chk_export_jobs_status CHECK (status IN ('PENDING', 'PROCESSING', 'READY', 'FAILED')),
    CONSTRAINT chk_export_jobs_format CHECK (format IN ('TEX', 'TRACEABILITY')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE audit_logs (
    id BINARY(16) NOT NULL PRIMARY KEY,
    actor_id BINARY(16) NOT NULL,
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id BINARY(16),
    old_value JSON,
    new_value JSON,
    severity VARCHAR(20) NOT NULL DEFAULT 'INFO',
    occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_audit_entity (entity_type, entity_id),
    INDEX idx_audit_actor (actor_id),
    INDEX idx_audit_occurred (occurred_at),
    INDEX idx_audit_report_range (action, entity_type, entity_id, occurred_at),
    INDEX idx_audit_severity (severity),
    FOREIGN KEY (actor_id) REFERENCES users(id)
);

CREATE TABLE project_checkpoints (
    id BINARY(16) NOT NULL PRIMARY KEY,
    project_id BINARY(16) NOT NULL,
    trigger_type VARCHAR(50) NOT NULL,
    snapshot_json LONGTEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_checkpoint_project (project_id, created_at),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE review_snapshots (
    id BINARY(16) NOT NULL PRIMARY KEY,
    project_id BINARY(16) NOT NULL,
    style VARCHAR(50) NOT NULL,
    input_fingerprint VARCHAR(64) NOT NULL,
    response_json LONGTEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_review_snapshots_lookup UNIQUE (project_id, style, input_fingerprint),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE ai_evaluation_jobs (
    id BINARY(16) NOT NULL PRIMARY KEY,
    project_id BINARY(16) NOT NULL,
    kind VARCHAR(50) NOT NULL,
    payload_json LONGTEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    started_at DATETIME,
    progress_current INT NOT NULL DEFAULT 0,
    progress_total INT NOT NULL DEFAULT 0,
    last_progress_at DATETIME(6),
    result_json LONGTEXT,
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    INDEX idx_ai_eval_project (project_id),
    INDEX idx_ai_eval_status (status),
    INDEX idx_ai_jobs_progress_timeout (status, last_progress_at),
    CONSTRAINT chk_ai_evaluation_jobs_status CHECK (status IN ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED')),
    CONSTRAINT chk_ai_evaluation_jobs_kind CHECK (kind IN ('SECTION_CITATION_REVIEW', 'SECTION_SUGGESTION', 'SOURCE_MATCHES', 'TRACE_RECHECK', 'SECTION_SELF_CHECK')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE section_review_guides (
    section_type VARCHAR(100) NOT NULL PRIMARY KEY,
    guidance TEXT NOT NULL,
    checklist_json JSON,
    active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE citation_review_rounds (
    id BINARY(16) NOT NULL PRIMARY KEY,
    project_id BINARY(16) NOT NULL,
    section_id BINARY(16) NOT NULL,
    section_version INT NOT NULL,
    requested_by BINARY(16) NOT NULL,
    content_fingerprint VARCHAR(64) NOT NULL,
    section_content_fingerprint VARCHAR(64),
    style VARCHAR(64) NOT NULL,
    generation_meta JSON,
    summary TEXT,
    complete BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_citation_review_rounds_section_fp (section_id, content_fingerprint),
    INDEX idx_citation_review_rounds_section (section_id),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (section_id) REFERENCES paper_sections(id) ON DELETE CASCADE,
    FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE evidence_revision_traces (
    id BINARY(16) NOT NULL PRIMARY KEY,
    round_id BINARY(16) NOT NULL,
    finding_index INT NOT NULL,
    section_id BINARY(16) NOT NULL,
    suggested_action VARCHAR(40) NOT NULL,
    criticality VARCHAR(40),
    parent_header VARCHAR(255),
    excerpt TEXT NOT NULL,
    excerpt_start INT NOT NULL,
    excerpt_end INT NOT NULL,
    rationale TEXT NOT NULL,
    confidence DECIMAL(5,4),
    source_id BINARY(16),
    chunk_id BINARY(16),
    evidence_quote TEXT,
    evidence_relation VARCHAR(40),
    student_action VARCHAR(40),
    explanation TEXT,
    after_passage LONGTEXT,
    after_fingerprint VARCHAR(64),
    after_section_version INT,
    round_duration_ms BIGINT,
    source_replaced BOOLEAN,
    outcome VARCHAR(20),
    instructor_id BINARY(16),
    judgment VARCHAR(20),
    instructor_feedback TEXT,
    judged_at DATETIME,
    linked_round_id BINARY(16),
    linked_mode VARCHAR(30),
    ai_recheck_judgment VARCHAR(20),
    ai_recheck_reason TEXT,
    ai_rechecked_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_evidence_revision_traces_round_finding (round_id, finding_index),
    INDEX idx_evidence_revision_traces_section (section_id),
    CONSTRAINT chk_evidence_revision_traces_student_action CHECK (student_action IS NULL OR student_action IN ('ADD_CITATION', 'PARAPHRASE', 'QUALIFY', 'SYNTHESIZE', 'QUOTE', 'REMOVE', 'DISMISS_WITH_REASON')),
    CONSTRAINT chk_evidence_revision_traces_outcome CHECK (outcome IS NULL OR outcome IN ('RESOLVED', 'PARTIALLY_RESOLVED', 'UNRESOLVED', 'STALE')),
    CONSTRAINT chk_evidence_revision_traces_judgment CHECK (judgment IS NULL OR judgment IN ('EFFECTIVE', 'PARTIAL', 'INEFFECTIVE')),
    CONSTRAINT chk_evidence_revision_traces_linked_mode CHECK (linked_mode IS NULL OR linked_mode IN ('VERBATIM_CONTINUATION', 'REVISION_CHAIN')),
    CONSTRAINT chk_evidence_revision_traces_ai_recheck_judgment CHECK (ai_recheck_judgment IS NULL OR ai_recheck_judgment IN ('EFFECTIVE', 'PARTIAL', 'INEFFECTIVE')),
    FOREIGN KEY (round_id) REFERENCES citation_review_rounds(id) ON DELETE CASCADE,
    FOREIGN KEY (section_id) REFERENCES paper_sections(id) ON DELETE CASCADE,
    FOREIGN KEY (source_id) REFERENCES documents(id) ON DELETE SET NULL,
    FOREIGN KEY (chunk_id) REFERENCES document_chunks(id) ON DELETE SET NULL,
    FOREIGN KEY (instructor_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (linked_round_id) REFERENCES citation_review_rounds(id) ON DELETE SET NULL
);

CREATE TABLE user_sessions (
    jti VARCHAR(64) NOT NULL PRIMARY KEY,
    user_id BINARY(16),
    issued_at DATETIME NOT NULL,
    expires_at DATETIME NOT NULL
);

CREATE TABLE email_otp_tokens (
    id BINARY(16) NOT NULL PRIMARY KEY,
    user_id BINARY(16) NOT NULL,
    email VARCHAR(255) NOT NULL,
    code_hash VARCHAR(64) NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    expires_at DATETIME(6) NOT NULL,
    cooldown_until DATETIME(6),
    verified_at DATETIME(6),
    created_at DATETIME(6) NOT NULL,
    INDEX idx_otp_user_email (user_id, email, created_at),
    FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE email_otp_claims (
    token_hash VARCHAR(64) NOT NULL PRIMARY KEY,
    user_id BINARY(16) NOT NULL,
    email VARCHAR(255) NOT NULL,
    expires_at DATETIME(6) NOT NULL,
    consumed_at DATETIME(6),
    created_at DATETIME(6) NOT NULL,
    INDEX idx_claim_user (user_id),
    FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE ai_model_gate_state (
    gate_key VARCHAR(32) NOT NULL PRIMARY KEY,
    next_allowed_at DATETIME(6) NOT NULL
);

CREATE TABLE ai_model_call_leases (
    lease_id CHAR(36) NOT NULL PRIMARY KEY,
    expires_at DATETIME(6) NOT NULL,
    INDEX idx_ai_model_call_leases_expiry (expires_at)
);

CREATE TABLE ai_model_call_outcomes (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    breaker_failure BOOLEAN NOT NULL,
    occurred_at DATETIME(6) NOT NULL,
    INDEX idx_ai_model_call_outcomes_window (occurred_at)
);

CREATE TABLE section_standard_evaluations (
    id BINARY(16) NOT NULL PRIMARY KEY,
    section_id BINARY(16) NOT NULL,
    document_id BINARY(16) NOT NULL,
    project_id BINARY(16) NOT NULL,
    input_fingerprint VARCHAR(64) NOT NULL,
    pass_threshold INT,
    requirements_json LONGTEXT,
    status VARCHAR(20) NOT NULL,
    score_percent INT,
    result_json LONGTEXT,
    raw_output LONGTEXT,
    prompt_fingerprint VARCHAR(64),
    generation_fingerprint VARCHAR(64),
    generation_provider VARCHAR(100),
    generation_model VARCHAR(255),
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

CREATE TABLE prompt_templates (
    id BINARY(16) NOT NULL PRIMARY KEY,
    template_key VARCHAR(100) NOT NULL,
    version VARCHAR(50) NOT NULL,
    system_text LONGTEXT NOT NULL,
    json_schema JSON,
    model VARCHAR(100),
    active BOOLEAN NOT NULL DEFAULT FALSE,
    created_by BINARY(16),
    active_template_key VARCHAR(100) GENERATED ALWAYS AS (CASE WHEN active THEN template_key ELSE NULL END) STORED,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE INDEX uq_prompt_key_version (template_key, version),
    UNIQUE INDEX uq_prompt_single_active (active_template_key),
    INDEX idx_prompt_active (template_key, active),
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

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
            '{"type":"array","items":{"type":"object","required":["name"],"properties":{"name":{"type":"string","minLength":1,"maxLength":500},"affiliations":{"type":"array","items":{"type":"string","maxLength":500}},"emails":{"type":"array","items":{"type":"string","maxLength":320}}}}}',
            authors_json)
    ),
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

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
    FOREIGN KEY (updated_by) REFERENCES users(id)
);

CREATE TABLE paper_references (
    id BINARY(16) NOT NULL PRIMARY KEY,
    paper_id BINARY(16) NOT NULL,
    source_id BINARY(16) NOT NULL,
    added_by BINARY(16) NOT NULL,
    added_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    UNIQUE INDEX uk_paper_reference (paper_id, source_id),
    INDEX ix_paper_reference_order (paper_id, added_at),
    FOREIGN KEY (paper_id) REFERENCES documents(id) ON DELETE CASCADE,
    FOREIGN KEY (source_id) REFERENCES documents(id) ON DELETE CASCADE,
    FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE review_section_snapshots (
    id BINARY(16) NOT NULL PRIMARY KEY,
    request_id BINARY(16) NOT NULL,
    section_id BINARY(16) NOT NULL,
    content_tex LONGTEXT NOT NULL,
    content_version INT,
    snapshot_type VARCHAR(10) NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT NOW(6),
    CONSTRAINT chk_rss_type CHECK (snapshot_type IN ('BASELINE', 'SUBMITTED')),
    CONSTRAINT uq_rss_request_section_type UNIQUE (request_id, section_id, snapshot_type),
    INDEX idx_rss_request (request_id, snapshot_type),
    FOREIGN KEY (request_id) REFERENCES feedback_requests(id) ON DELETE CASCADE,
    FOREIGN KEY (section_id) REFERENCES paper_sections(id) ON DELETE CASCADE
);

CREATE TABLE assignment_section_baselines (
    id BINARY(16) NOT NULL PRIMARY KEY,
    project_id BINARY(16) NOT NULL,
    section_id BINARY(16) NOT NULL,
    content_tex LONGTEXT NOT NULL,
    content_version INT,
    created_at DATETIME(6) NOT NULL DEFAULT NOW(6),
    CONSTRAINT uq_asb_project_section UNIQUE (project_id, section_id),
    INDEX idx_asb_lookup (project_id, section_id, created_at),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (section_id) REFERENCES paper_sections(id) ON DELETE CASCADE
);
