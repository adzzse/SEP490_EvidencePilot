package com.evidencepilot.repository;

import com.evidencepilot.model.AssignmentSectionBaseline;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface AssignmentSectionBaselineRepository extends JpaRepository<AssignmentSectionBaseline, UUID> {

    boolean existsByProjectIdAndSectionId(UUID projectId, UUID sectionId);

    Optional<AssignmentSectionBaseline> findByProjectIdAndSectionId(UUID projectId, UUID sectionId);
}
