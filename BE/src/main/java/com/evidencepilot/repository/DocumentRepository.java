package com.evidencepilot.repository;

import com.evidencepilot.model.Document;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.ProcessingStatus;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

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
    @Query("SELECT d.id FROM Document d WHERE d.processingStatus IN :statuses AND d.active = true")
    List<UUID> findIdsByProcessingStatusInAndActiveTrue(
            @Param("statuses") List<ProcessingStatus> processingStatuses);

    @Modifying(clearAutomatically = true)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    @Query("""
            UPDATE Document d
            SET d.processingStatus = :queued, d.processingError = null, d.processedAt = null
            WHERE d.id = :documentId AND d.processingStatus IN :eligible AND d.active = true
            """)
    int queueForExtraction(
            @Param("documentId") UUID documentId,
            @Param("eligible") List<ProcessingStatus> eligible,
            @Param("queued") ProcessingStatus queued);

    @Modifying(clearAutomatically = true)
    @Query("""
            UPDATE Document d
            SET d.processingStatus = :processing, d.processingError = null, d.processedAt = null
            WHERE d.id = :documentId AND d.processingStatus = :queued AND d.active = true
            """)
    int claimQueued(
            @Param("documentId") UUID documentId,
            @Param("queued") ProcessingStatus queued,
            @Param("processing") ProcessingStatus processing);
}
