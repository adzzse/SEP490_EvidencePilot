package com.evidencepilot.repository;

import com.evidencepilot.model.Document;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.ProcessingStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.EntityGraph;
import java.util.List;
import java.util.UUID;
import java.util.Optional;

public interface DocumentRepository extends JpaRepository<Document, UUID>, JpaSpecificationExecutor<Document> {
    @Override
    @EntityGraph(attributePaths = "project")
    Optional<Document> findById(UUID id);

    long countByActiveTrueAndDocType(DocumentType docType);
    long countByProcessingStatus(ProcessingStatus processingStatus);
    long countByCollectionId(UUID collectionId);
    List<Document> findByProjectId(UUID projectId);
    List<Document> findByProjectIdAndDocTypeAndActiveTrue(UUID projectId, DocumentType docType);
    List<Document> findByCollectionId(UUID collectionId);
    List<Document> findByCollectionIdAndDocTypeAndActiveTrue(UUID collectionId, DocumentType docType);
    List<Document> findByProcessingStatusAndActiveTrue(ProcessingStatus processingStatus);
}
