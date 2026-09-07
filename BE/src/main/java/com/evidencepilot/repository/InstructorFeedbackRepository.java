package com.evidencepilot.repository;

import com.evidencepilot.model.InstructorFeedback;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface InstructorFeedbackRepository extends JpaRepository<InstructorFeedback, UUID> {

    List<InstructorFeedback> findByRequestId(UUID requestId);

    @EntityGraph(attributePaths = "request")
    List<InstructorFeedback> findBySectionId(UUID sectionId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select f from InstructorFeedback f where f.id = :id")
    Optional<InstructorFeedback> findByIdForUpdate(@Param("id") UUID id);

    @EntityGraph(attributePaths = "section")
    List<InstructorFeedback> findByRequestProjectId(UUID projectId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select f from InstructorFeedback f join f.request r where r.project.id = :projectId")
    List<InstructorFeedback> findByRequestProjectIdForUpdate(@Param("projectId") UUID projectId);
}
