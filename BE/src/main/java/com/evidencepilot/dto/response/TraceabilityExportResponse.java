package com.evidencepilot.dto.response;

import com.evidencepilot.model.FeedbackStatus;
import com.evidencepilot.model.enums.PaperStandard;
import com.evidencepilot.model.enums.ProjectStatus;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public record TraceabilityExportResponse(
    UUID projectId,
    String projectTitle,
    String projectDescription,
    ProjectStatus projectStatus,
    PaperStandard targetStandard,
    Instant generatedAt,
    List<TraceabilityPaper> papers,
    List<TraceabilitySection> sections,
    List<TraceabilitySource> sources,
    List<TraceabilitySourceReference> sourceReferences,
    List<ProjectSourceMapResponse.GraphNode> externalReferences,
    List<ProjectSourceMapResponse.GraphEdge> sourceRelations,
    List<TraceabilityFeedback> feedback,
    List<TraceabilityComment> feedbackComments,
    List<FeedbackReplyResponseDto> feedbackReplies,
    List<TraceabilityAttachment> feedbackAttachments,
    List<TraceabilityTrace> traces,
    List<ProgressReportResponse.MemberContribution> memberProgress
) {
    public record TraceabilityPaper(UUID id, String title) {}

    public record TraceabilitySection(
        UUID id, UUID paperId, String title, Integer sectionOrder,
        Integer wordCount, Integer version, UUID assignedUserId,
        LocalDateTime updatedAt, String contentTex
    ) {}

    public record TraceabilitySource(
        UUID id, String title, String authors, Integer publicationYear,
        String doi, String publisher, String filename, Long fileSizeBytes,
        int referenceCount, Integer citedByCount, String openAlexTopic,
        String openAlexSubfield, String openAlexField, String openAlexDomain,
        String processingStatus
    ) {}

    public record TraceabilitySourceReference(
        UUID id, UUID sourceId, Integer referenceIndex, String edgeType,
        String title, String doi, Integer publicationYear, String rawText
    ) {}

    public record TraceabilityFeedback(
        UUID id, UUID studentId, UUID instructorId, FeedbackStatus status,
        LocalDateTime requestedAt, LocalDateTime reviewedAt
    ) {}

    public record TraceabilityComment(
        UUID id, UUID requestId, UUID sectionId, String content,
        String threadState, String studentNote, LocalDateTime publishedAt
    ) {}

    public record TraceabilityAttachment(
        UUID id, UUID feedbackId, UUID replyId, String mimeType,
        Long fileSizeBytes, String archivePath, LocalDateTime createdAt
    ) {}

    public record TraceabilityTrace(
        UUID id, UUID roundId, UUID sectionId, String sectionTitle,
        Integer findingIndex, String suggestedAction, String excerpt,
        String rationale, UUID sourceId, String sourceTitle,
        String evidenceQuote, String evidenceRelation, String studentAction,
        String studentExplanation, String outcome, String judgment,
        String instructorFeedback, LocalDateTime createdAt
    ) {}
}
