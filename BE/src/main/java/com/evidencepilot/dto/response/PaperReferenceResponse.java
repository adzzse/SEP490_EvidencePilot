package com.evidencepilot.dto.response;

import com.evidencepilot.model.Document;
import com.evidencepilot.model.PaperReference;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.ProcessingStatus;
import com.evidencepilot.service.impl.SourceMatchingService;

import java.time.LocalDateTime;
import java.util.UUID;

public record PaperReferenceResponse(
        UUID sourceId,
        String citationKey,
        String title,
        String authors,
        Integer publicationYear,
        String doi,
        ProcessingStatus processingStatus,
        String processingError,
        boolean fileAvailable,
        boolean retrievable,
        boolean canAttachFile,
        LocalDateTime addedAt,
        UUID addedBy) {
    public static PaperReferenceResponse from(PaperReference reference, boolean canAttachFile) {
        Document source = reference.getSource();
        return new PaperReferenceResponse(
                source.getId(),
                SourceMatchingService.citationKey(source.getId()),
                source.getTitle(),
                source.getAuthors(),
                source.getPublicationYear(),
                source.getDoi(),
                source.getProcessingStatus(),
                source.getProcessingError() == null ? null : "SOURCE_PROCESSING_FAILED",
                fileAvailable(source),
                retrievable(source),
                canAttachFile,
                reference.getAddedAt(),
                reference.getAddedBy() != null ? reference.getAddedBy().getId() : null);
    }

    static boolean fileAvailable(Document source) {
        return source.getFileUrl() != null && !source.getFileUrl().isBlank()
                && !"pending".equals(source.getFileUrl());
    }

    static boolean retrievable(Document source) {
        return source.getDocType() == DocumentType.SOURCE
                && (source.getProcessingStatus() == ProcessingStatus.READY
                        || source.getProcessingStatus() == ProcessingStatus.COMPLETED);
    }
}
