package com.evidencepilot.repository;

import com.evidencepilot.model.PaperReference;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import jakarta.persistence.LockModeType;

public interface PaperReferenceRepository extends JpaRepository<PaperReference, UUID> {
    @Query("""
            SELECT r FROM PaperReference r JOIN FETCH r.source s
            JOIN r.paper p JOIN p.project project LEFT JOIN s.project sourceProject
            WHERE p.id = :paperId AND p.active = true
              AND p.docType = com.evidencepilot.model.enums.DocumentType.PAPER
              AND s.active = true AND s.docType = com.evidencepilot.model.enums.DocumentType.SOURCE
              AND (sourceProject.id = project.id OR EXISTS (
                    SELECT pd.id FROM ProjectDocument pd
                    WHERE pd.project.id = project.id AND pd.document.id = s.id
              ))
            ORDER BY r.addedAt ASC, s.id ASC
            """)
    List<PaperReference> findByPaperIdOrderByAddedAtAsc(@Param("paperId") UUID paperId);
    Optional<PaperReference> findByPaperIdAndSourceId(UUID paperId, UUID sourceId);
    boolean existsByPaperIdAndSourceId(UUID paperId, UUID sourceId);
    @Query("""
            SELECT CASE WHEN COUNT(r) > 0 THEN true ELSE false END
            FROM PaperReference r
            WHERE r.source.id = :sourceId
              AND r.paper.project.id = :projectId
              AND r.paper.active = true
              AND r.paper.docType = com.evidencepilot.model.enums.DocumentType.PAPER
            """)
    boolean existsActiveForProject(@Param("projectId") UUID projectId, @Param("sourceId") UUID sourceId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            SELECT r FROM PaperReference r
            WHERE r.source.id = :sourceId
              AND r.paper.project.id = :projectId
              AND r.paper.active = true
              AND r.paper.docType = com.evidencepilot.model.enums.DocumentType.PAPER
            """)
    List<PaperReference> findActiveForProjectForUpdate(
            @Param("projectId") UUID projectId, @Param("sourceId") UUID sourceId);

    @Query("""
            SELECT CASE WHEN COUNT(r) > 0 THEN true ELSE false END
            FROM PaperReference r
            WHERE r.source.id = :sourceId
              AND r.paper.active = true
              AND r.paper.docType = com.evidencepilot.model.enums.DocumentType.PAPER
            """)
    boolean existsActiveForSource(@Param("sourceId") UUID sourceId);

    void deleteByPaperIdAndSourceId(UUID paperId, UUID sourceId);
}
