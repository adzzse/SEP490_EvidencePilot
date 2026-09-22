-- 46. Deletion-scheduled projects carry their own lifecycle status.
-- Stores the pre-deletion status so revoke restores it, and widens the
-- projects status CHECK (auto-named projects_chk_1, same convention as the
-- users_chk_2 drop in V23) to admit PENDING_DELETE.
ALTER TABLE projects ADD COLUMN status_before_deletion VARCHAR(50) NULL;
ALTER TABLE projects DROP CHECK projects_chk_1;
ALTER TABLE projects
    ADD CONSTRAINT chk_projects_status
        CHECK (status IN (
            'CREATED', 'ASSIGNED', 'IN_PROGRESS', 'SUBMITTED_FOR_REVIEW',
            'RETURNED', 'APPROVED', 'ARCHIVED', 'PENDING_DELETE'
        ));
