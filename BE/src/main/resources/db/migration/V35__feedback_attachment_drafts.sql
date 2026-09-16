-- V35: feedback attachments support the presigned-upload flow, where bytes land
-- in MinIO before the thread/reply row exists. Unclaimed rows (feedback_id NULL)
-- are swept after 24h; claimed rows keep the V34 lifecycle.

-- V34 shipped the table without a target rule; introduce it here together with
-- the nullable draft state. Legal states: unclaimed drafts (both NULL),
-- thread-level (feedback set), reply-level (both set). A reply attachment
-- without its thread is meaningless.
ALTER TABLE feedback_attachments
    MODIFY feedback_id BINARY(16) NULL;

ALTER TABLE feedback_attachments
    ADD CONSTRAINT chk_fb_att_target
        CHECK (feedback_id IS NOT NULL OR reply_id IS NULL);
