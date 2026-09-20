package com.evidencepilot.repository;

import com.evidencepilot.model.EvidenceRevisionTrace;
import com.evidencepilot.model.enums.TraceOutcome;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface EvidenceRevisionTraceRepository extends JpaRepository<EvidenceRevisionTrace, UUID> {
    @Query("select t from EvidenceRevisionTrace t where t.round.project.id = :projectId")
    org.springframework.data.domain.Slice<EvidenceRevisionTrace> findForExport(@Param("projectId") UUID projectId, org.springframework.data.domain.Pageable pageable);

    List<EvidenceRevisionTrace> findBySectionIdOrderByCreatedAtDesc(UUID sectionId);

    List<EvidenceRevisionTrace> findByRoundIdOrderByFindingIndex(UUID roundId);

    @Query("""
            select t from EvidenceRevisionTrace t
            join fetch t.round r
            where r.project.id = :projectId
            order by t.createdAt desc
            """)
    List<EvidenceRevisionTrace> findByProjectIdOrderByCreatedAtDesc(@Param("projectId") UUID projectId);

    @Query("""
            select t from EvidenceRevisionTrace t
            join fetch t.round r
            where r.project.id = :projectId
              and t.outcome in :outcomes
            order by t.createdAt desc
            """)
    List<EvidenceRevisionTrace> findByProjectIdAndOutcomeInOrderByCreatedAtDesc(
            @Param("projectId") UUID projectId, @Param("outcomes") List<TraceOutcome> outcomes);

    @Query("""
            SELECT CASE WHEN COUNT(t) > 0 THEN true ELSE false END
            FROM EvidenceRevisionTrace t
            WHERE t.source.id = :sourceId
              AND t.round.project.id = :projectId
              AND (t.sourceReplaced = false OR t.sourceReplaced IS NULL)
            """)
    boolean existsActiveForProjectAndSource(
            @Param("projectId") UUID projectId, @Param("sourceId") UUID sourceId);

    @Query("""
            SELECT CASE WHEN COUNT(t) > 0 THEN true ELSE false END
            FROM EvidenceRevisionTrace t
            WHERE t.source.id = :sourceId
              AND (t.sourceReplaced = false OR t.sourceReplaced IS NULL)
            """)
    boolean existsActiveForSource(@Param("sourceId") UUID sourceId);
}
