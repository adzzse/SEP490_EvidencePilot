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

    @Query("SELECT j FROM AiEvaluationJob j WHERE j.status = 'PROCESSING' AND j.startedAt < :cutoff")
    List<AiEvaluationJob> findStuckProcessing(@Param("cutoff") LocalDateTime cutoff);

    @Modifying
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    @Query("UPDATE AiEvaluationJob j SET j.progressCurrent = :current, j.progressTotal = :total WHERE j.id = :jobId")
    int updateProgress(
            @Param("jobId") UUID jobId,
            @Param("current") int current,
            @Param("total") int total);
}
