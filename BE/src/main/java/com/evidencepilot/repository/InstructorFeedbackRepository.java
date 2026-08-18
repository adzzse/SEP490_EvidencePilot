package com.evidencepilot.repository;

import com.evidencepilot.model.InstructorFeedback;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface InstructorFeedbackRepository extends JpaRepository<InstructorFeedback, UUID> {

    List<InstructorFeedback> findByRequestId(UUID requestId);

    @EntityGraph(attributePaths = "section")
    List<InstructorFeedback> findByRequestProjectId(UUID projectId);
}
