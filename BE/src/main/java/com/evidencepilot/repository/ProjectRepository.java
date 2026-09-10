package com.evidencepilot.repository;

import com.evidencepilot.model.Project;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import java.util.UUID;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

public interface ProjectRepository extends JpaRepository<Project, UUID>, JpaSpecificationExecutor<Project> {
    @Query("select project.title from Project project where project.title in :titles")
    List<String> findExistingTitles(@Param("titles") java.util.Collection<String> titles);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select project from Project project where project.id = :id")
    Optional<Project> findByIdForUpdate(@Param("id") UUID id);

    long countByActiveTrue();

    @Query("select project.status, count(project) from Project project where project.active = true group by project.status")
    List<Object[]> countActiveByStatus();
}
