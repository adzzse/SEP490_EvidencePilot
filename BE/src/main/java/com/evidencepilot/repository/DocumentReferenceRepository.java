package com.evidencepilot.repository;

import com.evidencepilot.model.DocumentReference;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.EdgeType;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface DocumentReferenceRepository extends JpaRepository<DocumentReference, UUID> {
    List<DocumentReference> findByDocumentProjectIdAndDocumentDocTypeAndDocumentActiveTrueOrderByDocumentIdAscReferenceIndexAsc(
            UUID projectId, DocumentType docType);

    List<DocumentReference> findByDocumentIdAndEdgeTypeOrderByReferenceIndexAsc(
            UUID documentId, EdgeType edgeType);
}
