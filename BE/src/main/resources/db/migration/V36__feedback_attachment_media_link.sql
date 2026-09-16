-- V36: immutable media linking for feedback attachments.
--
-- The link flow copies bytes server-side (CopyObject) from the student library
-- into a feedback-owned key, then severs the tie: media_asset_id is provenance
-- /display only (texFilename) and SET NULL on library deletion. The thread read
-- path uses exclusively the cloned storage_key, so student cleanup can never
-- break published feedback.
--
-- project_media gains file_size_bytes (persisted at upload going forward) so
-- links copy the integer 1:1 with zero MinIO stat calls. Pre-existing library
-- rows keep NULL size and are stat-once-and-persisted at first link.

ALTER TABLE project_media
    ADD COLUMN file_size_bytes BIGINT NULL;

ALTER TABLE feedback_attachments
    ADD COLUMN media_asset_id BINARY(16) NULL AFTER reply_id,
    ADD CONSTRAINT fk_fb_att_media_asset
        FOREIGN KEY (media_asset_id) REFERENCES project_media(id) ON DELETE SET NULL,
    ADD INDEX idx_fb_att_media_asset (media_asset_id);
