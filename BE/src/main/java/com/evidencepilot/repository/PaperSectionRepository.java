package com.evidencepilot.repository;

import com.evidencepilot.model.PaperSection;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PaperSectionRepository extends JpaRepository<PaperSection, UUID> {
    @Query("select s from PaperSection s where s.document.project.id = :projectId")
    org.springframework.data.domain.Slice<PaperSection> findForExport(@org.springframework.data.repository.query.Param("projectId") UUID projectId, org.springframework.data.domain.Pageable pageable);

    @Query("""
            select s from PaperSection s
            join fetch s.document d
            left join fetch d.project
            where s.id = :id
            """)
    Optional<PaperSection> findByIdWithDocument(UUID id);

    List<PaperSection> findByDocumentIdOrderBySectionOrderAsc(UUID documentId);
    List<PaperSection> findByDocumentIdAndAssignedUserIdOrderBySectionOrderAsc(UUID documentId, UUID assignedUserId);
    // Sections across every document of one project — admin project-detail modal.
    long countByDocument_Project_Id(UUID projectId);
    // Batch twin of the memberCounts pattern — feeds ProjectResponse.sectionCount on list endpoints.
    @Query("SELECT s.document.project.id, COUNT(s) FROM PaperSection s WHERE s.document.project.id IN :projectIds GROUP BY s.document.project.id")
    List<Object[]> countByProjectIds(@org.springframework.data.repository.query.Param("projectIds") List<UUID> projectIds);
    // Full section list across every document of one project (admin modal Sections tab).
    List<PaperSection> findByDocument_Project_IdOrderByDocument_IdAscSectionOrderAsc(UUID projectId);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            update PaperSection s
            set s.assignedUser = null,
                s.handoffConfirmedBy = null,
                s.handoffConfirmedAt = null,
                s.handoffContentVersion = null,
                s.handoffInputFingerprint = null,
                s.updatedAt = CURRENT_TIMESTAMP
            where s.document.project.id = :projectId
              and s.assignedUser.id = :userId
            """)
    int clearAssignmentsForProjectAndUser(
            @Param("projectId") UUID projectId,
            @Param("userId") UUID userId);

    // Bulk hard-delete all sections for a paper — used by resetSectionsForStandard.
    // Spring Data derives: DELETE FROM paper_sections WHERE document_id = ?
    // @Transactional is required by Spring Data for derived-delete methods.
    @Transactional
    void deleteByDocumentId(UUID documentId);
}
