package com.evidencepilot.service;

import com.evidencepilot.dto.request.SectionReviewSourceMatchRequest;
import com.evidencepilot.dto.response.JobResponse;
import com.evidencepilot.dto.response.JobSubmitResponse;
import com.evidencepilot.dto.response.SectionCitationReviewStateResponse;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AiEvaluationService {
    JobSubmitResponse submit(UUID projectId, String kind, String payloadJson);

    JobSubmitResponse submitSectionCitationReview(
            UUID projectId,
            UUID documentId,
            UUID sectionId,
            String reviewInputFingerprint,
            UUID requestedByUserId);

    Optional<SectionCitationReviewStateResponse> findSectionCitationReviewState(
            UUID projectId, UUID documentId, UUID sectionId, String inputFingerprint);

    JobSubmitResponse submitSectionSuggestion(
            UUID projectId,
            UUID documentId,
            UUID sectionId,
            String sectionType);

    JobSubmitResponse submitSectionSelfCheck(
            UUID projectId, UUID documentId, UUID sectionId,
            String inputFingerprint, UUID requestedByUserId);

    JobSubmitResponse submitSourceMatches(
            UUID projectId,
            UUID documentId,
            UUID sectionId,
            List<SectionReviewSourceMatchRequest.Finding> findings);

    void process(UUID jobId);

    void markFailed(UUID jobId, String error);

    JobResponse getJob(UUID jobId);
}
