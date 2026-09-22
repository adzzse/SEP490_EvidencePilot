CREATE TABLE project_deletion_cleanup_tasks (
    id BINARY(16) NOT NULL PRIMARY KEY,
    project_id BINARY(16) NOT NULL,
    resource_type VARCHAR(32) NOT NULL,
    resource_key VARCHAR(512) NOT NULL,
    guard_key VARCHAR(64),
    attempts INT NOT NULL DEFAULT 0,
    next_attempt_at DATETIME(6) NOT NULL,
    last_error VARCHAR(1000),
    created_at DATETIME(6) NOT NULL,
    UNIQUE INDEX uq_project_cleanup_resource (project_id, resource_type, resource_key),
    INDEX idx_project_cleanup_due (next_attempt_at)
);
