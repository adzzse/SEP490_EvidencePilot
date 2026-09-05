package com.evidencepilot.repository;

import com.evidencepilot.model.AiEvaluationJob;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Collection;
import java.util.UUID;

public interface AiEvaluationJobRepository extends JpaRepository<AiEvaluationJob, UUID> {
    List<AiEvaluationJob> findByStatus(String status);

    List<AiEvaluationJob> findByProjectIdAndKindAndStatusInOrderByCreatedAtDesc(
            UUID projectId, String kind, Collection<String> statuses);

    @Modifying
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    @Query("""
            UPDATE AiEvaluationJob j SET j.status = 'FAILED', j.errorMessage = :error,
                j.completedAt = :completedAt
            WHERE j.status = 'PROCESSING' AND COALESCE(j.lastProgressAt, j.startedAt) < :cutoff
            """)
    int failStuck(@Param("cutoff") LocalDateTime cutoff,
            @Param("completedAt") LocalDateTime completedAt, @Param("error") String error);

    @Modifying(clearAutomatically = true)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    @Query("""
            UPDATE AiEvaluationJob j
            SET j.status = 'PROCESSING', j.startedAt = :startedAt, j.lastProgressAt = :startedAt
            WHERE j.id = :jobId AND j.status = 'PENDING'
            """)
    int claimPending(
            @Param("jobId") UUID jobId,
            @Param("startedAt") LocalDateTime startedAt);

    @Modifying
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    @Query("""
            UPDATE AiEvaluationJob j SET j.progressCurrent = :current, j.progressTotal = :total,
                j.lastProgressAt = :progressAt
            WHERE j.id = :jobId AND j.status = 'PROCESSING'
                AND (j.progressCurrent < :current OR j.progressTotal < :total)
            """)
    int updateProgress(
            @Param("jobId") UUID jobId,
            @Param("current") int current,
            @Param("total") int total,
            @Param("progressAt") LocalDateTime progressAt);

    @Modifying
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    @Query("UPDATE AiEvaluationJob j SET j.resultJson = :result WHERE j.id = :jobId AND j.status = 'PROCESSING'")
    int saveCheckpoint(@Param("jobId") UUID jobId, @Param("result") String result);

    @Modifying
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    @Query("""
            UPDATE AiEvaluationJob j SET j.status = :status, j.resultJson = COALESCE(:result, j.resultJson),
                j.errorMessage = :error, j.completedAt = :completedAt
            WHERE j.id = :jobId AND j.status = 'PROCESSING'
            """)
    int finishProcessing(@Param("jobId") UUID jobId, @Param("status") String status,
            @Param("result") String result, @Param("error") String error,
            @Param("completedAt") LocalDateTime completedAt);

    @Modifying
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    @Query("""
            UPDATE AiEvaluationJob j SET j.status = 'FAILED', j.errorMessage = :error,
                j.completedAt = :completedAt
            WHERE j.id = :jobId AND j.status IN ('PENDING', 'PROCESSING')
            """)
    int failActive(@Param("jobId") UUID jobId, @Param("error") String error,
            @Param("completedAt") LocalDateTime completedAt);
}
