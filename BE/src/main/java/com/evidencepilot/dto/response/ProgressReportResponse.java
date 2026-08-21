package com.evidencepilot.dto.response;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public record ProgressReportResponse(
    UUID projectId,
    List<SectionPanel> sections,
    List<MemberContribution> contributions,
    Readiness readiness
) {
    public record SectionPanel(
        UUID sectionId,
        String sectionTitle,
        int wordCount,
        UUID assignedUserId,
        String assignedUserName,
        int version,
        LocalDateTime lastUpdated,
        int feedbackAnswered,
        int feedbackUnanswered
    ) {}

    public record MemberContribution(
        UUID userId,
        String userName,
        int assignedSectionCount,
        int currentWordCount,
        int saveCount,
        int wordDelta,
        int wordsAdded,
        int wordsRemoved,
        LocalDateTime lastEditedAt,
        int feedbackAnswered,
        int feedbackUnanswered,
        List<String> editedSections,
        List<DailyWordDelta> dailyWordDeltas
    ) {}

    public record DailyWordDelta(
        LocalDate date,
        int saveCount,
        int wordDelta,
        int wordsAdded,
        int wordsRemoved
    ) {}

    public record Readiness(
        int score,
        int contentCoveragePercent,
        List<ReadinessMetric> metrics
    ) {}

    public record ReadinessMetric(
        String code,
        String label,
        int weightPercent,
        int valuePercent
    ) {}
}
