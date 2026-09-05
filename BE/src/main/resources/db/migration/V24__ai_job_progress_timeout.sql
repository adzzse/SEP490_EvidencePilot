ALTER TABLE ai_evaluation_jobs ADD COLUMN last_progress_at DATETIME(6) NULL AFTER started_at;

UPDATE ai_evaluation_jobs
SET last_progress_at = COALESCE(started_at, created_at)
WHERE status = 'PROCESSING';

CREATE INDEX idx_ai_jobs_progress_timeout ON ai_evaluation_jobs (status, last_progress_at);
