package com.evidencepilot.repository;

import com.evidencepilot.model.ProjectMedia;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface ProjectMediaRepository extends JpaRepository<ProjectMedia, UUID> {
    List<ProjectMedia> findByProjectId(UUID projectId);
    List<ProjectMedia> findByProjectIdOrderByIdAsc(UUID projectId);
    List<ProjectMedia> findByStorageKeyStartingWith(String prefix);
    boolean existsByProjectIdAndStorageKey(UUID projectId, String storageKey);
}
