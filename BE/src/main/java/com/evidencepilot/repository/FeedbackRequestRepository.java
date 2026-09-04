package com.evidencepilot.repository;

import com.evidencepilot.model.FeedbackRequest;
import com.evidencepilot.model.FeedbackStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface FeedbackRequestRepository extends JpaRepository<FeedbackRequest, UUID> {

    List<FeedbackRequest> findByProjectIdOrderByRequestedAtDesc(UUID projectId);

    List<FeedbackRequest> findByStudentIdOrderByRequestedAtDesc(UUID studentId);

    List<FeedbackRequest> findByInstructorIdOrderByRequestedAtDesc(UUID instructorId);

    List<FeedbackRequest> findByStatus(FeedbackStatus status);

    long countByInstructorIdAndStatus(UUID instructorId, FeedbackStatus status);

    boolean existsByProjectIdAndInstructorId(UUID projectId, UUID instructorId);

    boolean existsByProjectIdAndStatus(UUID projectId, FeedbackStatus status);
}
