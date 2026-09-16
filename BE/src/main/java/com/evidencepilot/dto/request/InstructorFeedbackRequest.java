package com.evidencepilot.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;

public record InstructorFeedbackRequest(
    @NotNull UUID sectionId,
    @Size(max = 100) String lineReference,
    @NotBlank String content,
    @Valid FeedbackAnchorRequest anchor,
    List<UUID> mediaAssetIds
) {
    public InstructorFeedbackRequest(UUID sectionId, String lineReference, String content) {
        this(sectionId, lineReference, content, null, null);
    }

    public InstructorFeedbackRequest(UUID sectionId, String lineReference, String content,
                                     FeedbackAnchorRequest anchor) {
        this(sectionId, lineReference, content, anchor, null);
    }
}
