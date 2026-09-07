package com.evidencepilot.service;

import com.evidencepilot.dto.request.InstructorFeedbackRequest;
import com.evidencepilot.dto.request.FeedbackReplyRequest;
import com.evidencepilot.dto.request.FeedbackStateRequest;
import com.evidencepilot.dto.request.SubmitReviewRequest;
import com.evidencepilot.dto.response.FeedbackRequestResponseDto;
import com.evidencepilot.dto.response.InstructorFeedbackResponseDto;
import com.evidencepilot.dto.response.ReviewSubmissionSnapshotResponse;
import java.util.List;
import java.util.UUID;
import org.springframework.transaction.annotation.Transactional;

public interface FeedbackService {
    List<FeedbackRequestResponseDto> findAllForCurrentUser();
    FeedbackRequestResponseDto submitForReview(UUID projectId, SubmitReviewRequest request);
    InstructorFeedbackResponseDto comment(UUID feedbackRequestId, InstructorFeedbackRequest request);
    List<InstructorFeedbackResponseDto> getFeedbackItems(UUID feedbackRequestId);
    InstructorFeedbackResponseDto updateFeedbackItem(UUID feedbackItemId, InstructorFeedbackRequest request);
    void deleteFeedbackItem(UUID feedbackItemId);
    FeedbackRequestResponseDto updateStatus(UUID feedbackRequestId, String status);
    InstructorFeedbackResponseDto answerFeedback(UUID feedbackItemId, String answerContent, UUID idempotencyKey);
    @Transactional
    default InstructorFeedbackResponseDto answerFeedback(UUID feedbackItemId, String answerContent) {
        return answerFeedback(feedbackItemId, answerContent, UUID.randomUUID());
    }
    InstructorFeedbackResponseDto createInstructorReply(UUID feedbackItemId, FeedbackReplyRequest request);
    InstructorFeedbackResponseDto updateInstructorReply(UUID feedbackItemId, UUID replyId, FeedbackReplyRequest request);
    void deleteInstructorReply(UUID feedbackItemId, UUID replyId);
    InstructorFeedbackResponseDto prepareFeedbackState(UUID feedbackItemId, FeedbackStateRequest request);
    ReviewSubmissionSnapshotResponse getSubmissionSnapshot(UUID feedbackRequestId);
}
