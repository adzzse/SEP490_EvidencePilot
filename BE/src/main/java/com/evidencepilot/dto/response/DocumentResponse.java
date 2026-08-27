package com.evidencepilot.dto.response;

import com.evidencepilot.model.Document;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.ProcessingStatus;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public record DocumentResponse(
    UUID id,
    UUID projectId,
    UUID collectionId,
    UUID uploadedBy,
    DocumentType docType,
    String fileUrl,
    String title,
    String authors,
    Integer publicationYear,
    String originalFilename,
    String contentType,
    Long fileSizeBytes,
    String fileHashSha256,
    ProcessingStatus processingStatus,
    String processingError,
    boolean active,
    LocalDateTime createdAt,
    String openAlexTopic,
    String openAlexSubfield,
    String openAlexField,
    String openAlexDomain,
    List<UUID> projectIds
) {
    public static DocumentResponse from(Document doc) {
        return from(doc, List.of());
    }

    public static DocumentResponse from(Document doc, List<UUID> projectIds) {
        return new DocumentResponse(
            doc.getId(),
            doc.getProject() != null ? doc.getProject().getId() : null,
            doc.getCollection() != null ? doc.getCollection().getId() : null,
            doc.getUploadedBy() != null ? doc.getUploadedBy().getId() : null,
            doc.getDocType(),
            doc.getFileUrl(),
            doc.getTitle(),
            doc.getAuthors(),
            doc.getPublicationYear(),
            doc.getOriginalFilename(),
            doc.getContentType(),
            doc.getFileSizeBytes(),
            doc.getFileHashSha256(),
            doc.getProcessingStatus(),
            doc.getProcessingError(),
            doc.isActive(),
            doc.getCreatedAt(),
            doc.getOpenAlexTopic(),
            doc.getOpenAlexSubfield(),
            doc.getOpenAlexField(),
            doc.getOpenAlexDomain(),
            projectIds
        );
    }
}
