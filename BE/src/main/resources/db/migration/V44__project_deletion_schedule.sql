ALTER TABLE projects ADD COLUMN deletion_scheduled_at DATETIME(6) NULL;
CREATE INDEX idx_projects_deletion_scheduled_at ON projects (deletion_scheduled_at);
