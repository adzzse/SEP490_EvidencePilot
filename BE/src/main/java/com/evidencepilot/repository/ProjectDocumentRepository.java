package com.evidencepilot.repository;

import com.evidencepilot.model.ProjectDocument;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ProjectDocumentRepository extends JpaRepository<ProjectDocument, UUID> {
    List<ProjectDocument> findByProjectId(UUID projectId);
    Optional<ProjectDocument> findByProjectIdAndDocumentId(UUID projectId, UUID documentId);
    boolean existsByDocumentId(UUID documentId);
    List<ProjectDocument> findByDocumentId(UUID documentId);
    List<ProjectDocument> findByDocumentIdIn(List<UUID> documentIds);
    List<ProjectDocument> findByProjectCollectionId(UUID projectCollectionId);
}
