package com.evidencepilot.service.impl;

import com.evidencepilot.dto.response.ProgressReportResponse;
import com.evidencepilot.exception.ResourceNotFoundException;
import com.evidencepilot.model.AuditLog;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.InstructorFeedback;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.ProjectMember;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.AuditLogRepository;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.InstructorFeedbackRepository;
import com.evidencepilot.repository.PaperSectionRepository;
import com.evidencepilot.repository.ProjectMemberRepository;
import com.evidencepilot.repository.ProjectRepository;
import com.evidencepilot.service.CurrentUserService;
import com.evidencepilot.service.ProgressReportService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ProgressReportServiceImpl implements ProgressReportService {

    private static final String SECTION_EDIT_ACTION = "SECTION_CONTENT_UPDATED";

    private final ProjectRepository projectRepository;
    private final DocumentRepository documentRepository;
    private final PaperSectionRepository paperSectionRepository;
    private final InstructorFeedbackRepository instructorFeedbackRepository;
    private final ProjectMemberRepository projectMemberRepository;
    private final AuditLogRepository auditLogRepository;
    private final CurrentUserService currentUserService;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional(readOnly = true)
    public ProgressReportResponse getProgressReport(UUID projectId, String memberFilter) {
        User currentUser = currentUserService.requireCurrentUser();
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new ResourceNotFoundException(projectId, "Project"));
        if (!project.isActive()) {
            throw new ResourceNotFoundException(projectId, "Project");
        }
        currentUserService.requireProjectAccess(currentUser, project);

        List<PaperSection> allSections = new ArrayList<>();
        for (Document paper : documentRepository
                .findByProjectIdAndDocTypeAndActiveTrue(projectId, DocumentType.PAPER)) {
            allSections.addAll(paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(paper.getId())
                    .stream().filter(PaperSection::isActive).toList());
        }
        UUID filterUserId = memberFilter == null || memberFilter.isBlank()
                || "ALL".equalsIgnoreCase(memberFilter) ? null : parseUuid(memberFilter);

        List<InstructorFeedback> feedbackList = instructorFeedbackRepository.findByRequestProjectId(projectId);
        // Single pass over all feedback items: no per-section re-scan (sections x feedback).
        Map<UUID, int[]> feedbackCounts = new HashMap<>();
        for (InstructorFeedback feedback : feedbackList) {
            if (feedback.getSection() == null) continue;
            int[] counts = feedbackCounts.computeIfAbsent(feedback.getSection().getId(), k -> new int[2]);
            if (feedback.isAnswered()) counts[0]++; else counts[1]++;
        }
        List<ProgressReportResponse.SectionPanel> allPanels = new ArrayList<>();
        for (PaperSection section : allSections) {
            int[] counts = feedbackCounts.getOrDefault(section.getId(), new int[2]);
            allPanels.add(new ProgressReportResponse.SectionPanel(
                    section.getId(),
                    section.getSectionTitle(),
                    wordCount(section.getContentTex()),
                    section.getAssignedUser() != null ? section.getAssignedUser().getId() : null,
                    section.getAssignedUser() != null ? fullName(section.getAssignedUser()) : null,
                    section.getVersion() != null ? section.getVersion() : 1,
                    section.getUpdatedAt(),
                    counts[0],
                    counts[1]));
        }

        Map<UUID, ContributionAccumulator> contributionByUser = new LinkedHashMap<>();
        for (ProjectMember member : projectMemberRepository.findByProjectId(projectId)) {
            User memberUser = member.getUser();
            if (memberUser != null && memberUser.getRole() == UserRole.STUDENT) {
                contributionByUser.putIfAbsent(
                        memberUser.getId(), new ContributionAccumulator(memberUser));
            }
        }
        for (ProgressReportResponse.SectionPanel panel : allPanels) {
            ContributionAccumulator contribution = contributionByUser.get(panel.assignedUserId());
            if (contribution != null) {
                contribution.addCurrentSection(panel);
            }
        }
        // ponytail: project-sized scan; add a date range only when edit volume makes this report slow.
        for (AuditLog edit : auditLogRepository
                .findByActionAndEntityTypeAndEntityIdOrderByOccurredAtAsc(
                        SECTION_EDIT_ACTION, "PROJECT", projectId)) {
            ContributionAccumulator contribution = edit.getActor() == null
                    ? null : contributionByUser.get(edit.getActor().getId());
            if (contribution == null || edit.getNewValue() == null || edit.getOccurredAt() == null) {
                continue;
            }
            try {
                JsonNode payload = objectMapper.readTree(edit.getNewValue());
                if (payload.has("wordDelta")) {
                    int delta = payload.get("wordDelta").asInt();
                    int wordsAdded = payload.has("wordsAdded")
                            ? payload.get("wordsAdded").asInt() : Math.max(delta, 0);
                    int wordsRemoved = payload.has("wordsRemoved")
                            ? payload.get("wordsRemoved").asInt() : Math.max(-delta, 0);
                    contribution.addEdit(delta, wordsAdded, wordsRemoved,
                            payload.path("sectionTitle").asText(null), edit.getOccurredAt());
                }
            } catch (Exception ignored) {
                // A malformed historical audit row must not hide the rest of the report.
            }
        }

        List<ProgressReportResponse.SectionPanel> panels = allPanels.stream()
                .filter(panel -> filterUserId == null || filterUserId.equals(panel.assignedUserId()))
                .toList();
        List<ProgressReportResponse.MemberContribution> contributions = contributionByUser.values().stream()
                .filter(contribution -> filterUserId == null
                        || filterUserId.equals(contribution.user.getId()))
                .map(ContributionAccumulator::toResponse)
                .toList();

        int contentCoverage = allSections.isEmpty() ? 0
                : (int) Math.round(allSections.stream()
                        .filter(section -> wordCount(section.getContentTex()) > 0)
                        .count() * 100.0 / allSections.size());
        List<ProgressReportResponse.ReadinessMetric> metrics = List.of(
                new ProgressReportResponse.ReadinessMetric(
                        "content_coverage", "Content coverage", 100, contentCoverage));

        return new ProgressReportResponse(
                projectId,
                panels,
                contributions,
                new ProgressReportResponse.Readiness(contentCoverage, contentCoverage, metrics));
    }

    private static int wordCount(String contentTex) {
        if (contentTex == null || contentTex.isBlank()) return 0;
        return contentTex.trim().split("\\s+").length;
    }

    private static UUID parseUuid(String value) {
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static String fullName(User user) {
        String first = user.getFirstName() == null ? "" : user.getFirstName().trim();
        String last = user.getLastName() == null ? "" : user.getLastName().trim();
        String name = (first + " " + last).trim();
        return name.isBlank() ? user.getEmail() : name;
    }

    private static final class ContributionAccumulator {
        private final User user;
        private final Map<LocalDate, int[]> daily = new TreeMap<>(Comparator.reverseOrder());
        private int assignedSectionCount;
        private int currentWordCount;
        private int saveCount;
        private int wordDelta;
        private int wordsAdded;
        private int wordsRemoved;
        private LocalDateTime lastEditedAt;
        private int feedbackAnswered;
        private int feedbackUnanswered;
        private final Set<String> editedSections = new LinkedHashSet<>();

        private ContributionAccumulator(User user) {
            this.user = user;
        }

        private void addCurrentSection(ProgressReportResponse.SectionPanel panel) {
            assignedSectionCount++;
            currentWordCount += panel.wordCount();
            feedbackAnswered += panel.feedbackAnswered();
            feedbackUnanswered += panel.feedbackUnanswered();
        }

        private void addEdit(int delta, int added, int removed, String sectionTitle,
                LocalDateTime occurredAt) {
            saveCount++;
            wordDelta += delta;
            wordsAdded += Math.max(added, 0);
            wordsRemoved += Math.max(removed, 0);
            if (sectionTitle != null && !sectionTitle.isBlank()) editedSections.add(sectionTitle);
            if (lastEditedAt == null || occurredAt.isAfter(lastEditedAt)) {
                lastEditedAt = occurredAt;
            }
            int[] day = daily.computeIfAbsent(occurredAt.toLocalDate(), ignored -> new int[4]);
            day[0]++;
            day[1] += delta;
            day[2] += Math.max(added, 0);
            day[3] += Math.max(removed, 0);
        }

        private ProgressReportResponse.MemberContribution toResponse() {
            List<ProgressReportResponse.DailyWordDelta> dailyWordDeltas = daily.entrySet().stream()
                    .map(entry -> new ProgressReportResponse.DailyWordDelta(
                            entry.getKey(), entry.getValue()[0], entry.getValue()[1],
                            entry.getValue()[2], entry.getValue()[3]))
                    .toList();
            return new ProgressReportResponse.MemberContribution(
                    user.getId(),
                    fullName(user),
                    assignedSectionCount,
                    currentWordCount,
                    saveCount,
                    wordDelta,
                    wordsAdded,
                    wordsRemoved,
                    lastEditedAt,
                    feedbackAnswered,
                    feedbackUnanswered,
                    List.copyOf(editedSections),
                    dailyWordDeltas);
        }
    }
}
