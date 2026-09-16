package com.evidencepilot.repository;

import com.evidencepilot.model.FeedbackAttachment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Repository
public interface FeedbackAttachmentRepository extends JpaRepository<FeedbackAttachment, UUID> {

    List<FeedbackAttachment> findByFeedbackId(UUID feedbackId);

    List<FeedbackAttachment> findByFeedbackIsNullAndCreatedAtBefore(LocalDateTime cutoff);
}
