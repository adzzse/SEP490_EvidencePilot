package com.evidencepilot.repository;

import com.evidencepilot.model.DocumentReference;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.EdgeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface DocumentReferenceRepository extends JpaRepository<DocumentReference, UUID> {
    @Query("select r from DocumentReference r join fetch r.document d where d.id in :documentIds "
            + "order by d.id, r.referenceIndex")
    List<DocumentReference> findForDocuments(@Param("documentIds") Collection<UUID> documentIds);

    List<DocumentReference> findByDocumentProjectIdAndDocumentDocTypeAndDocumentActiveTrueOrderByDocumentIdAscReferenceIndexAsc(
            UUID projectId, DocumentType docType);

    List<DocumentReference> findByDocumentIdAndEdgeTypeOrderByReferenceIndexAsc(
            UUID documentId, EdgeType edgeType);
}
