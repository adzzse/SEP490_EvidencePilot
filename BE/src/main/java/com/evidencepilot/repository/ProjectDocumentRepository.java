package com.evidencepilot.repository;

import com.evidencepilot.model.ProjectDocument;
import com.evidencepilot.model.enums.DocumentType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
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
    // Shared sources per project, excluding docs already counted as direct uploads of the same project.
    @Query("""
            SELECT pd.project.id, COUNT(pd) FROM ProjectDocument pd
            WHERE pd.project.id IN :projectIds
              AND pd.document.docType = :docType
              AND pd.document.active = true
              AND (pd.document.project IS NULL OR pd.document.project.id <> pd.project.id)
            GROUP BY pd.project.id
            """)
    List<Object[]> countSharedSourcesByProjectIds(
            @Param("projectIds") List<UUID> projectIds,
            @Param("docType") DocumentType docType);
}
