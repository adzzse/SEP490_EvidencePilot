package com.evidencepilot.service;

import com.evidencepilot.dto.response.ReviewReadinessResponse;
import com.evidencepilot.dto.response.SectionHandoffResponse;
import com.evidencepilot.exception.ResourceNotFoundException;
import com.evidencepilot.exception.SubmissionReadinessException;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.FeedbackStatus;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.ProjectMember;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.AccountStatus;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.ProcessingStatus;
import com.evidencepilot.model.enums.ProjectRole;
import com.evidencepilot.model.enums.ProjectStatus;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.FeedbackRequestRepository;
import com.evidencepilot.repository.PaperSectionRepository;
import com.evidencepilot.repository.ProjectRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class SubmissionReadinessService {

    private static final Set<ProjectStatus> EDITABLE_STATUSES = Set.of(
            ProjectStatus.ASSIGNED, ProjectStatus.IN_PROGRESS, ProjectStatus.RETURNED);
    private static final Set<ProcessingStatus> READY_PAPER_STATUSES = Set.of(
            ProcessingStatus.READY, ProcessingStatus.COMPLETED);

    private final ProjectRepository projectRepository;
    private final DocumentRepository documentRepository;
    private final PaperSectionRepository paperSectionRepository;
    private final FeedbackRequestRepository feedbackRequestRepository;
    private final SectionStandardService sectionStandardService;
    private final CurrentUserService currentUserService;
    private final ObjectMapper objectMapper;

    @Transactional(readOnly = true)
    public ReviewReadinessResponse readiness(UUID projectId) {
        User currentUser = currentUserService.requireCurrentUser();
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new ResourceNotFoundException(projectId, "Project"));
        currentUserService.requireProjectAccess(currentUser, project);
        return assess(project, currentUser).response();
    }

    @Transactional
    public SectionHandoffResponse confirm(
            UUID documentId, UUID sectionId, String expectedInputFingerprint) {
        PaperSection located = requireSection(documentId, sectionId);
        UUID projectId = located.getDocument().getProject().getId();
        projectRepository.findByIdForUpdate(projectId)
                .orElseThrow(() -> new ResourceNotFoundException(projectId, "Project"));

        PaperSection section = requireSection(documentId, sectionId);
        User currentUser = currentUserService.requireCurrentUser();
        currentUserService.requireSectionContentWriteAccess(currentUser, section);
        if (section.getContentTex() == null || section.getContentTex().isBlank()) {
            throw new SubmissionReadinessException(
                    "SECTION_HANDOFF_NOT_READY",
                    "Save non-empty section content before confirming handoff.",
                    Map.of("sectionId", sectionId.toString()));
        }
        String currentFingerprint = sectionStandardService.inputFingerprint(section);
        if (!Objects.equals(expectedInputFingerprint, currentFingerprint)) {
            throw new SubmissionReadinessException(
                    "HANDOFF_INPUT_CHANGED",
                    "The section changed after it was loaded.",
                    Map.of("sectionId", sectionId.toString()));
        }

        boolean alreadyConfirmed = section.getHandoffConfirmedBy() != null
                && currentUser.getId().equals(section.getHandoffConfirmedBy().getId())
                && currentFingerprint.equals(section.getHandoffInputFingerprint())
                && Objects.equals(section.getVersion(), section.getHandoffContentVersion());
        if (!alreadyConfirmed) {
            section.setHandoffConfirmedBy(currentUser);
            section.setHandoffConfirmedAt(LocalDateTime.now());
            section.setHandoffContentVersion(section.getVersion());
            section.setHandoffInputFingerprint(currentFingerprint);
            paperSectionRepository.saveAndFlush(section);
        }
        return handoffResponse(section, currentFingerprint);
    }

    @Transactional
    public SectionHandoffResponse revoke(UUID documentId, UUID sectionId) {
        PaperSection located = requireSection(documentId, sectionId);
        UUID projectId = located.getDocument().getProject().getId();
        projectRepository.findByIdForUpdate(projectId)
                .orElseThrow(() -> new ResourceNotFoundException(projectId, "Project"));

        PaperSection section = requireSection(documentId, sectionId);
        User currentUser = currentUserService.requireCurrentUser();
        currentUserService.requireSectionContentWriteAccess(currentUser, section);
        if (section.getHandoffConfirmedBy() != null) {
            clearHandoff(section);
            paperSectionRepository.saveAndFlush(section);
        }
        return handoffResponse(section, sectionStandardService.inputFingerprint(section));
    }

    public Assessment requireReadyForSubmit(
            Project project, User currentUser, String expectedSubmissionFingerprint) {
        Assessment assessment = assess(project, currentUser);
        if (!assessment.response().canSubmit()) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN, "Only the project Leader can submit a review.");
        }
        if (!"READY".equals(assessment.response().state())) {
            throw new SubmissionReadinessException(
                    "REVIEW_NOT_READY", "The project is not ready for review.");
        }
        if (!Objects.equals(expectedSubmissionFingerprint,
                assessment.response().submissionFingerprint())) {
            throw new SubmissionReadinessException(
                    "SUBMISSION_INPUT_CHANGED",
                    "Review inputs changed after readiness was loaded.");
        }
        return assessment;
    }

    public Assessment assess(Project project, User currentUser) {
        List<Document> papers = documentRepository
                .findByProjectIdAndDocTypeAndActiveTrue(project.getId(), DocumentType.PAPER).stream()
                .sorted(Comparator.comparing(document -> document.getId().toString()))
                .toList();
        Map<UUID, ProjectMember> studentMembers = new HashMap<>();
        if (project.getProjectMembers() != null) {
            for (ProjectMember member : project.getProjectMembers()) {
                if (member.getUser() != null
                        && member.getUser().getRole() == UserRole.STUDENT
                        && member.getUser().getAccountStatus() == AccountStatus.ACTIVE
                        && (member.getRole() == ProjectRole.LEADER || member.getRole() == ProjectRole.MEMBER)) {
                    studentMembers.put(member.getUser().getId(), member);
                }
            }
        }

        boolean projectEditable = project.isActive()
                && EDITABLE_STATUSES.contains(project.getStatus())
                && !feedbackRequestRepository.existsByProjectIdAndStatus(
                        project.getId(), FeedbackStatus.PENDING);
        boolean instructorAssigned = project.getInstructor() != null
                && project.getInstructor().getRole() == UserRole.INSTRUCTOR
                && project.getInstructor().getAccountStatus() == AccountStatus.ACTIVE;
        boolean papersPresent = !papers.isEmpty();
        boolean papersReady = papersPresent;
        boolean sectionsPresent = papersPresent;
        boolean bodiesPresent = true;
        boolean assigneesValid = true;
        boolean sectionsConfirmed = true;

        List<String> paperNotReadyIds = new ArrayList<>();
        List<String> paperWithoutSectionIds = new ArrayList<>();
        List<String> emptySectionIds = new ArrayList<>();
        List<String> invalidAssigneeSectionIds = new ArrayList<>();
        List<String> unconfirmedSectionIds = new ArrayList<>();
        Map<UUID, List<PaperSection>> sectionsByPaper = new LinkedHashMap<>();
        List<ReviewReadinessResponse.Paper> paperResponses = new ArrayList<>();
        List<String> fingerprintParts = new ArrayList<>(List.of(
                "review-readiness-v1",
                project.getId().toString(),
                Objects.toString(project.getStatus(), ""),
                String.valueOf(project.isActive()),
                instructorAssigned ? project.getInstructor().getId().toString() : ""));

        for (Document paper : papers) {
            boolean paperReady = READY_PAPER_STATUSES.contains(paper.getProcessingStatus());
            if (!paperReady) {
                papersReady = false;
                paperNotReadyIds.add(paper.getId().toString());
            }
            List<PaperSection> sections = paperSectionRepository
                    .findByDocumentIdOrderBySectionOrderAsc(paper.getId()).stream()
                    .filter(PaperSection::isActive)
                    .sorted(Comparator.comparing(PaperSection::getSectionOrder)
                            .thenComparing(section -> section.getId().toString()))
                    .toList();
            sectionsByPaper.put(paper.getId(), sections);
            if (sections.isEmpty()) {
                sectionsPresent = false;
                paperWithoutSectionIds.add(paper.getId().toString());
            }

            fingerprintParts.add(String.join(":",
                    "paper", paper.getId().toString(),
                    Objects.toString(paper.getTitle(), ""),
                    Objects.toString(paper.getProcessingStatus(), "")));
            List<ReviewReadinessResponse.Section> sectionResponses = new ArrayList<>();
            for (PaperSection section : sections) {
                List<String> blockers = new ArrayList<>();
                boolean bodyPresent = section.getContentTex() != null
                        && !section.getContentTex().isBlank();
                if (!bodyPresent) {
                    bodiesPresent = false;
                    emptySectionIds.add(section.getId().toString());
                    blockers.add("SECTION_BODY_PRESENT");
                }

                User assigned = section.getAssignedUser();
                boolean assigneeValid = assigned != null
                        && studentMembers.containsKey(assigned.getId());
                if (!assigneeValid) {
                    assigneesValid = false;
                    invalidAssigneeSectionIds.add(section.getId().toString());
                    blockers.add("ASSIGNEE_VALID");
                }

                String currentInputFingerprint = sectionStandardService.inputFingerprint(section);
                boolean hasReceipt = section.getHandoffConfirmedBy() != null
                        || section.getHandoffInputFingerprint() != null;
                boolean confirmed = assigneeValid
                        && section.getHandoffConfirmedBy() != null
                        && assigned.getId().equals(section.getHandoffConfirmedBy().getId())
                        && currentInputFingerprint.equals(section.getHandoffInputFingerprint())
                        && Objects.equals(section.getVersion(), section.getHandoffContentVersion());
                String handoffState = confirmed ? "CONFIRMED" : hasReceipt ? "STALE" : "UNCONFIRMED";
                if (!confirmed) {
                    sectionsConfirmed = false;
                    unconfirmedSectionIds.add(section.getId().toString());
                    blockers.add("SECTION_CONFIRMED");
                }

                sectionResponses.add(new ReviewReadinessResponse.Section(
                        section.getId(), paper.getId(), section.getSectionTitle(),
                        section.getSectionOrder(), section.getVersion(), section.getOptVersion(),
                        assigned != null ? assigned.getId() : null, displayName(assigned),
                        currentInputFingerprint, handoffState,
                        section.getHandoffConfirmedBy() != null
                                ? section.getHandoffConfirmedBy().getId() : null,
                        displayName(section.getHandoffConfirmedBy()), section.getHandoffConfirmedAt(),
                        section.getHandoffContentVersion(), List.copyOf(blockers)));
                fingerprintParts.add(String.join(":",
                        "section", section.getId().toString(), currentInputFingerprint,
                        handoffState,
                        section.getHandoffConfirmedBy() == null ? "" : section.getHandoffConfirmedBy().getId().toString(),
                        Objects.toString(section.getHandoffConfirmedAt(), "")));
            }
            paperResponses.add(new ReviewReadinessResponse.Paper(
                    paper.getId(), paper.getTitle(), Objects.toString(paper.getProcessingStatus(), ""),
                    List.copyOf(sectionResponses)));
        }

        List<ReviewReadinessResponse.Check> checks = List.of(
                check("PROJECT_EDITABLE", projectEditable,
                        "Project can accept a review submission.", List.of(project.getId().toString())),
                check("INSTRUCTOR_ASSIGNED", instructorAssigned,
                        "An instructor is assigned.", List.of()),
                check("PAPER_PRESENT", papersPresent,
                        "At least one active paper exists.", List.of()),
                check("PAPER_READY", papersReady,
                        "Every active paper finished processing.", paperNotReadyIds),
                check("SECTIONS_PRESENT", sectionsPresent,
                        "Every active paper has active sections.", paperWithoutSectionIds),
                check("SECTION_BODY_PRESENT", bodiesPresent,
                        "Every active section has saved content.", emptySectionIds),
                check("ASSIGNEE_VALID", assigneesValid,
                        "Every active section has a current student assignee.", invalidAssigneeSectionIds),
                check("SECTION_CONFIRMED", sectionsConfirmed,
                        "Every assignee handed off the current saved version.", unconfirmedSectionIds));
        boolean ready = checks.stream().allMatch(check -> "SATISFIED".equals(check.status()));
        boolean canSubmit = currentUser != null && currentUser.getRole() == UserRole.STUDENT
                && studentMembers.containsKey(currentUser.getId())
                && studentMembers.get(currentUser.getId()).getRole() == ProjectRole.LEADER;
        String submissionFingerprint = sha256(serialize(fingerprintParts));
        ReviewReadinessResponse response = new ReviewReadinessResponse(
                ready ? "READY" : "NOT_READY", canSubmit, submissionFingerprint,
                checks, List.copyOf(paperResponses));
        return new Assessment(response, papers, sectionsByPaper);
    }

    public String snapshot(
            Assessment assessment, Project project, User submittedBy,
            User instructor, LocalDateTime submittedAt) {
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("schemaVersion", 1);
        root.put("projectId", project.getId());
        root.put("submittedAt", submittedAt);
        root.put("submissionFingerprint", assessment.response().submissionFingerprint());
        root.put("submittedById", submittedBy.getId());
        root.put("submittedByName", displayName(submittedBy));
        root.put("instructorId", instructor.getId());

        List<Map<String, Object>> papers = new ArrayList<>();
        for (Document paper : assessment.papers()) {
            Map<String, Object> paperSnapshot = new LinkedHashMap<>();
            paperSnapshot.put("id", paper.getId());
            paperSnapshot.put("title", paper.getTitle());
            paperSnapshot.put("processingStatus", paper.getProcessingStatus());
            List<Map<String, Object>> sections = new ArrayList<>();
            for (PaperSection section : assessment.sectionsByPaper()
                    .getOrDefault(paper.getId(), List.of())) {
                Map<String, Object> sectionSnapshot = new LinkedHashMap<>();
                sectionSnapshot.put("id", section.getId());
                sectionSnapshot.put("title", section.getSectionTitle());
                sectionSnapshot.put("order", section.getSectionOrder());
                sectionSnapshot.put("contentTex", section.getContentTex());
                sectionSnapshot.put("contentVersion", section.getVersion());
                sectionSnapshot.put("assignedUserId", section.getAssignedUser().getId());
                sectionSnapshot.put("assignedUserName", displayName(section.getAssignedUser()));
                sectionSnapshot.put("confirmedById", section.getHandoffConfirmedBy().getId());
                sectionSnapshot.put("confirmedByName", displayName(section.getHandoffConfirmedBy()));
                sectionSnapshot.put("confirmedAt", section.getHandoffConfirmedAt());
                sectionSnapshot.put("confirmedContentVersion", section.getHandoffContentVersion());
                sections.add(sectionSnapshot);
            }
            paperSnapshot.put("sections", sections);
            papers.add(paperSnapshot);
        }
        root.put("papers", papers);
        return serialize(root);
    }

    private PaperSection requireSection(UUID documentId, UUID sectionId) {
        return paperSectionRepository.findByIdWithDocument(sectionId)
                .filter(PaperSection::isActive)
                .filter(section -> documentId.equals(section.getDocument().getId()))
                .filter(section -> section.getDocument().isActive())
                .filter(section -> section.getDocument().getDocType() == DocumentType.PAPER)
                .filter(section -> section.getDocument().getProject() != null)
                .orElseThrow(() -> new ResourceNotFoundException(sectionId, "PaperSection"));
    }

    private SectionHandoffResponse handoffResponse(
            PaperSection section, String currentInputFingerprint) {
        boolean confirmed = section.getHandoffConfirmedBy() != null
                && section.getAssignedUser() != null
                && section.getAssignedUser().getId().equals(section.getHandoffConfirmedBy().getId())
                && currentInputFingerprint.equals(section.getHandoffInputFingerprint())
                && Objects.equals(section.getVersion(), section.getHandoffContentVersion());
        boolean hasReceipt = section.getHandoffConfirmedBy() != null
                || section.getHandoffInputFingerprint() != null;
        return new SectionHandoffResponse(
                section.getId(), confirmed ? "CONFIRMED" : hasReceipt ? "STALE" : "UNCONFIRMED",
                currentInputFingerprint,
                section.getHandoffConfirmedBy() != null ? section.getHandoffConfirmedBy().getId() : null,
                displayName(section.getHandoffConfirmedBy()), section.getHandoffConfirmedAt(),
                section.getHandoffContentVersion(), section.getOptVersion());
    }

    private static ReviewReadinessResponse.Check check(
            String code, boolean satisfied, String message, List<String> resourceIds) {
        return new ReviewReadinessResponse.Check(
                code, satisfied ? "SATISFIED" : "UNSATISFIED", message,
                List.copyOf(resourceIds));
    }

    private static void clearHandoff(PaperSection section) {
        section.setHandoffConfirmedBy(null);
        section.setHandoffConfirmedAt(null);
        section.setHandoffContentVersion(null);
        section.setHandoffInputFingerprint(null);
    }

    private static String displayName(User user) {
        if (user == null) return null;
        String firstName = user.getFirstName() == null ? "" : user.getFirstName().trim();
        String lastName = user.getLastName() == null ? "" : user.getLastName().trim();
        String name = (firstName + " " + lastName).trim();
        return name.isEmpty() ? user.getEmail() : name;
    }

    private String serialize(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Could not serialize review readiness", exception);
        }
    }

    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }

    public record Assessment(
            ReviewReadinessResponse response,
            List<Document> papers,
            Map<UUID, List<PaperSection>> sectionsByPaper
    ) {}
}
