package com.evidencepilot.repository;

import com.evidencepilot.model.ProjectDeletionCleanupTask;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ProjectDeletionCleanupTaskRepository extends JpaRepository<ProjectDeletionCleanupTask, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from ProjectDeletionCleanupTask t where t.id = :id")
    Optional<ProjectDeletionCleanupTask> findByIdForUpdate(@Param("id") UUID id);

    @Query("select t.id from ProjectDeletionCleanupTask t where t.nextAttemptAt <= :now order by t.nextAttemptAt asc")
    List<UUID> findDueTaskIds(@Param("now") LocalDateTime now, Pageable pageable);

    List<ProjectDeletionCleanupTask> findByProjectId(UUID projectId);
}
