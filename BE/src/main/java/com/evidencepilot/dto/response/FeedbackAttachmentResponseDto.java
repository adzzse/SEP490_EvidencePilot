package com.evidencepilot.dto.response;

import com.evidencepilot.model.FeedbackAttachment;

import java.util.UUID;

public record FeedbackAttachmentResponseDto(
        UUID id,
        UUID mediaAssetId,
        String texFilename,
        String mimeType,
        Long fileSizeBytes,
        String url) {

    public static FeedbackAttachmentResponseDto from(FeedbackAttachment attachment) {
        return from(attachment, null);
    }

    public static FeedbackAttachmentResponseDto from(FeedbackAttachment attachment, String url) {
        return new FeedbackAttachmentResponseDto(
                attachment.getId(),
                attachment.getMediaAsset() != null ? attachment.getMediaAsset().getId() : null,
                attachment.getMediaAsset() != null ? attachment.getMediaAsset().getTexFilename() : null,
                attachment.getMimeType(),
                attachment.getFileSizeBytes(),
                url);
    }
}
