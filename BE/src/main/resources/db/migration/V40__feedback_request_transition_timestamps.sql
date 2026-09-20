ALTER TABLE feedback_requests
    ADD COLUMN returned_at DATETIME(6) NULL,
    ADD COLUMN reviewed_at DATETIME(6) NULL;
