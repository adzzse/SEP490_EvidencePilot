ALTER TABLE instructor_feedbacks
    ADD COLUMN anchor_json LONGTEXT NULL,
    ADD COLUMN opt_version BIGINT NOT NULL DEFAULT 0;
