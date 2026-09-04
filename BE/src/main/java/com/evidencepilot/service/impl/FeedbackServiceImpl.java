package com.evidencepilot.service.impl;

import com.evidencepilot.dto.request.InstructorFeedbackRequest;
import com.evidencepilot.dto.request.SubmitReviewRequest;
import com.evidencepilot.dto.response.FeedbackRequestResponseDto;
import com.evidencepilot.dto.response.InstructorFeedbackResponseDto;
import com.evidencepilot.dto.response.ReviewSubmissionSnapshotResponse;
import com.evidencepilot.exception.ResourceNotFoundException;
import com.evidencepilot.model.FeedbackRequest;
import com.evidencepilot.model.FeedbackStatus;
import com.evidencepilot.model.InstructorFeedback;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.ProjectStatus;
import com.evidencepilot.repository.FeedbackRequestRepository;
import com.evidencepilot.repository.InstructorFeedbackRepository;
import com.evidencepilot.repository.PaperSectionRepository;
import com.evidencepilot.repository.ProjectRepository;
import com.evidencepilot.service.CurrentUserService;
import com.evidencepilot.service.CheckpointService;
import com.evidencepilot.service.FeedbackService;
import com.evidencepilot.service.SubmissionReadinessService;
import com.evidencepilot.service.SystemNotificationService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.transaction.annotation.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class FeedbackServiceImpl implements FeedbackService {

    private final FeedbackRequestRepository feedbackRequestRepository;
    private final InstructorFeedbackRepository instructorFeedbackRepository;
    private final PaperSectionRepository paperSectionRepository;
    private final ProjectRepository projectRepository;
    private final CurrentUserService currentUserService;
    private final SystemNotificationService systemNotificationService;
    private final CheckpointService checkpointService;
    private final ProjectCollectionService projectCollectionService;
    private final SubmissionReadinessService submissionReadinessService;
    private final ObjectMapper objectMapper;

    @Override
    public List<FeedbackRequestResponseDto> findAllForCurrentUser() {
        User currentUser = currentUserService.requireCurrentUser();
        List<FeedbackRequest> requests;
        if (currentUserService.isAdmin(currentUser)) {
            requests = feedbackRequestRepository.findAll(Sort.by(Sort.Direction.DESC, "requestedAt"));
        } else if (currentUserService.isInstructor(currentUser)) {
            requests = feedbackRequestRepository.findByInstructorIdOrderByRequestedAtDesc(currentUser.getId());
        } else {
            requests = feedbackRequestRepository.findByStudentIdOrderByRequestedAtDesc(currentUser.getId());
        }
        return requests.stream().map(FeedbackRequestResponseDto::fromEntity).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public ReviewSubmissionSnapshotResponse getSubmissionSnapshot(UUID feedbackRequestId) {
        User currentUser = currentUserService.requireCurrentUser();
        FeedbackRequest request = requireFeedbackAccess(feedbackRequestId, currentUser, false);
        if (request.getSubmissionSnapshotJson() == null
                || request.getSubmissionSnapshotJson().isBlank()) {
            return new ReviewSubmissionSnapshotResponse("LEGACY_NO_SNAPSHOT", null);
        }
        try {
            return new ReviewSubmissionSnapshotResponse(
                    "AVAILABLE", objectMapper.readTree(request.getSubmissionSnapshotJson()));
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Stored review snapshot is invalid", exception);
        }
    }

    @Override
    @Transactional
    public FeedbackRequestResponseDto submitForReview(UUID projectId, SubmitReviewRequest request) {
        User currentUser = currentUserService.requireCurrentUser();
        Project project = projectRepository.findByIdForUpdate(projectId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Project not found: " + projectId));
        currentUserService.requireProjectWriteAccess(currentUser, project);
        if (request == null || request.expectedSubmissionFingerprint() == null) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "expectedSubmissionFingerprint is required.");
        }
        User instructor = project.getInstructor();
        if (instructor == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Project has no instructor.");
        }
        SubmissionReadinessService.Assessment assessment = submissionReadinessService
                .requireReadyForSubmit(project, currentUser, request.expectedSubmissionFingerprint());

        FeedbackRequest feedbackRequest = new FeedbackRequest();
        feedbackRequest.setProject(project);
        feedbackRequest.setStudent(currentUser);
        feedbackRequest.setInstructor(instructor);
        feedbackRequest.setStatus(FeedbackStatus.PENDING);
        LocalDateTime now = LocalDateTime.now();
        feedbackRequest.setRequestedAt(now);
        feedbackRequest.setUpdatedAt(now);
        feedbackRequest.setFlagged(false);
        feedbackRequest.setSubmissionSnapshotJson(submissionReadinessService.snapshot(
                assessment, project, currentUser, instructor, now));

        project.setStatus(ProjectStatus.SUBMITTED_FOR_REVIEW);
        projectRepository.save(project);

        FeedbackRequest saved = feedbackRequestRepository.save(feedbackRequest);
        checkpointService.capture(projectId, "SUBMIT_FOR_REVIEW");
        systemNotificationService.createNotification(
                instructor,
                currentUser,
                "REVIEW_SUBMITTED",
                saved.getId(),
                currentUser.getEmail() + " submitted project \"" + project.getTitle() + "\" for review.");
        return FeedbackRequestResponseDto.fromEntity(saved);
    }

    @Override
    @Transactional
    public InstructorFeedbackResponseDto comment(UUID feedbackRequestId, InstructorFeedbackRequest request) {
        User currentUser = currentUserService.requireCurrentUser();
        FeedbackRequest feedbackRequest = requireFeedbackAccess(feedbackRequestId, currentUser, true);
        if (feedbackRequest.getStatus() != FeedbackStatus.PENDING) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Feedback request closed.");
        }
        if (feedbackRequest.getProject().getStatus().isReadOnly()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Project is read-only.");
        }
        PaperSection section = requireSectionInProject(request.sectionId(), feedbackRequest.getProject());
        Map<UUID, Integer> submittedVersions = submittedSectionVersions(feedbackRequest);
        if (feedbackRequest.getSubmissionSnapshotJson() != null
                && !feedbackRequest.getSubmissionSnapshotJson().isBlank()
                && !submittedVersions.containsKey(section.getId())) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Section was not part of this review submission.");
        }
        Integer reviewedVersion = submittedVersions.getOrDefault(
                section.getId(), section.getVersion());

        InstructorFeedback feedback = new InstructorFeedback();
        feedback.setRequest(feedbackRequest);
        feedback.setSection(section);
        feedback.setInstructor(currentUserService.isAdmin(currentUser)
                ? feedbackRequest.getInstructor()
                : currentUser);
        feedback.setLineReference(request.lineReference());
        feedback.setContent(request.content());
        feedback.setSectionVersion(reviewedVersion);
        LocalDateTime now = LocalDateTime.now();
        feedback.setCreatedAt(now);
        feedback.setUpdatedAt(now);
        feedback.setUpdatedBy(currentUser);
        InstructorFeedback saved = instructorFeedbackRepository.save(feedback);
        systemNotificationService.createNotification(
                feedbackRequest.getStudent(),
                currentUser,
                "INSTRUCTOR_FEEDBACK_ADDED",
                feedbackRequest.getId(),
                currentUser.getEmail() + " added feedback to project \""
                        + feedbackRequest.getProject().getTitle() + "\".");
        return InstructorFeedbackResponseDto.fromEntity(saved, section, reviewedVersion);
    }

    @Override
    @Transactional
    public List<InstructorFeedbackResponseDto> getFeedbackItems(UUID feedbackRequestId) {
        User currentUser = currentUserService.requireCurrentUser();
        FeedbackRequest request = requireFeedbackAccess(feedbackRequestId, currentUser, false);
        Map<UUID, Integer> submittedVersions = submittedSectionVersions(request);
        List<InstructorFeedback> items = instructorFeedbackRepository.findByRequestId(feedbackRequestId);
        List<PaperSection> sections = paperSectionRepository.findAllById(
                items.stream().map(f -> f.getSection().getId()).distinct().toList());
        Map<UUID, PaperSection> sectionsById = new HashMap<>();
        sections.forEach(s -> sectionsById.put(s.getId(), s));
        return items.stream()
                .map(f -> {
                    PaperSection section = sectionsById.get(f.getSection().getId());
                    return InstructorFeedbackResponseDto.fromEntity(f, section,
                            submittedVersions.getOrDefault(
                                    f.getSection().getId(), section != null ? section.getVersion() : null));
                })
                .toList();
    }

    @Override
    @Transactional
    public InstructorFeedbackResponseDto updateFeedbackItem(UUID feedbackItemId, InstructorFeedbackRequest request) {
        User currentUser = currentUserService.requireCurrentUser();
        InstructorFeedback feedback = requireOwnedFeedback(feedbackItemId, currentUser);
        requireEditable(feedback);
        feedback.setContent(request.content());
        feedback.setLineReference(request.lineReference());
        feedback.setUpdatedAt(LocalDateTime.now());
        feedback.setUpdatedBy(currentUser);
        InstructorFeedback saved = instructorFeedbackRepository.save(feedback);
        Integer reviewedVersion = submittedSectionVersions(feedback.getRequest())
                .getOrDefault(feedback.getSection().getId(), feedback.getSection().getVersion());
        return InstructorFeedbackResponseDto.fromEntity(saved, feedback.getSection(), reviewedVersion);
    }

    @Override
    @Transactional
    public void deleteFeedbackItem(UUID feedbackItemId) {
        User currentUser = currentUserService.requireCurrentUser();
        InstructorFeedback feedback = requireOwnedFeedback(feedbackItemId, currentUser);
        requireEditable(feedback);
        instructorFeedbackRepository.delete(feedback);
    }

    private InstructorFeedback requireOwnedFeedback(UUID feedbackItemId, User currentUser) {
        InstructorFeedback feedback = instructorFeedbackRepository.findById(feedbackItemId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Instructor feedback not found: " + feedbackItemId));
        boolean isAuthor = feedback.getInstructor() != null
                && currentUser.getId().equals(feedback.getInstructor().getId());
        if (!isAuthor && !currentUserService.isAdmin(currentUser)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Feedback access denied.");
        }
        return feedback;
    }

    private void requireEditable(InstructorFeedback feedback) {
        if (feedback.isAnswered()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Answered feedback is immutable.");
        }
        if (feedback.getRequest().getStatus() != FeedbackStatus.PENDING) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Feedback request closed.");
        }
        if (feedback.getRequest().getProject().getStatus().isReadOnly()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Project is read-only.");
        }
    }

    @Override
    @Transactional
    public InstructorFeedbackResponseDto answerFeedback(UUID feedbackItemId, String answerContent) {
        User currentUser = currentUserService.requireCurrentUser();
        InstructorFeedback feedback = instructorFeedbackRepository.findById(feedbackItemId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Instructor feedback not found: " + feedbackItemId));
        FeedbackRequest request = feedback.getRequest();
        if (request.getStudent() == null || !currentUser.getId().equals(request.getStudent().getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Only the assigned student can answer feedback.");
        }
        if (feedback.isAnswered()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Feedback already answered.");
        }
        if (request.getStatus() != FeedbackStatus.RETURNED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Feedback can only be answered when the request is RETURNED.");
        }
        if (request.getProject().getStatus().isReadOnly()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Project is read-only.");
        }
        PaperSection section = feedback.getSection();
        if (section != null && section.getAssignedUser() != null
                && !currentUser.getId().equals(section.getAssignedUser().getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "You are not assigned to this section.");
        }

        feedback.setAnswered(true);
        feedback.setAnswerContent(answerContent);
        LocalDateTime now = LocalDateTime.now();
        feedback.setAnsweredAt(now);
        feedback.setUpdatedAt(now);
        feedback.setUpdatedBy(currentUser);
        InstructorFeedback saved = instructorFeedbackRepository.save(feedback);

        // Answering feedback is not an approval: the request stays RETURNED and the
        // project remains writable until the instructor explicitly finalizes the review.
        systemNotificationService.createNotification(
                feedback.getInstructor(),
                currentUser,
                "FEEDBACK_ANSWERED",
                request.getId(),
                currentUser.getEmail() + " answered feedback on project \""
                        + request.getProject().getTitle() + "\".");

        return InstructorFeedbackResponseDto.fromEntity(saved, feedback.getSection(), feedback.getSection().getVersion());
    }

    @Override
    @Transactional
    public FeedbackRequestResponseDto updateStatus(UUID feedbackRequestId, String status) {
        User currentUser = currentUserService.requireCurrentUser();
        FeedbackStatus newStatus;
        try {
            newStatus = FeedbackStatus.valueOf(status.toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid status: " + status);
        }
        if (newStatus == FeedbackStatus.PENDING) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid status: " + status);
        }
        ProjectStatus projectStatus = switch (newStatus) {
            case REVIEWED -> ProjectStatus.APPROVED;
            // Decision: REJECTED closes the review round and sends the project back to
            // work (student fixes and submits a fresh request). It must NOT map back to
            // SUBMITTED_FOR_REVIEW — that would contradict the rejection.
            case REJECTED -> ProjectStatus.IN_PROGRESS;
            case RETURNED -> ProjectStatus.RETURNED;
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid status: " + status);
        };
        FeedbackRequest feedbackRequest = transition(feedbackRequestId, newStatus, projectStatus, currentUser);
        systemNotificationService.createNotification(
                feedbackRequest.getStudent(),
                currentUser,
                "REVIEW_STATUS_CHANGED",
                feedbackRequest.getId(),
                "Review status for project \"" + feedbackRequest.getProject().getTitle()
                        + "\" changed to " + newStatus + ".");
        return FeedbackRequestResponseDto.fromEntity(feedbackRequest);
    }

    private FeedbackRequest transition(UUID id, FeedbackStatus status, ProjectStatus projectStatus, User currentUser) {
        FeedbackRequest feedbackRequest = requireFeedbackAccess(id, currentUser, true);
        return applyTransition(feedbackRequest, status, projectStatus, currentUser);
    }

    private FeedbackRequest applyTransition(FeedbackRequest feedbackRequest, FeedbackStatus status,
                                           ProjectStatus projectStatus, User currentUser) {
        FeedbackStatus from = feedbackRequest.getStatus();
        boolean legal = switch (from) {
            case PENDING -> status == FeedbackStatus.RETURNED
                    || status == FeedbackStatus.REVIEWED
                    || status == FeedbackStatus.REJECTED;
            case RETURNED -> status == FeedbackStatus.REVIEWED
                    || status == FeedbackStatus.REJECTED;
            default -> false; // REVIEWED and REJECTED are terminal
        };
        if (!legal) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Illegal transition from " + from + " to " + status + ".");
        }
        Project project = projectRepository.findByIdForUpdate(feedbackRequest.getProject().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Project not found: " + feedbackRequest.getProject().getId()));
        feedbackRequest.setProject(project);
        List<FeedbackRequest> projectRequests = feedbackRequestRepository
                .findByProjectIdOrderByRequestedAtDesc(project.getId());
        if (projectRequests.isEmpty()
                || !projectRequests.getFirst().getId().equals(feedbackRequest.getId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Only the latest review request can be updated.");
        }
        if (feedbackRequest.getProject().getStatus().isReadOnly()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Project is read-only.");
        }
        ProjectStatus currentProjectStatus = project.getStatus();
        if (currentProjectStatus != projectStatus && !currentProjectStatus.canTransitionTo(projectStatus)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Illegal project transition from " + currentProjectStatus + " to " + projectStatus + ".");
        }
        feedbackRequest.setStatus(status);
        feedbackRequest.setUpdatedAt(LocalDateTime.now());
        project.setStatus(projectStatus);
        project.setUpdatedAt(LocalDateTime.now());
        projectRepository.save(project);
        if (projectStatus == ProjectStatus.IN_PROGRESS || projectStatus == ProjectStatus.RETURNED) {
            projectCollectionService.syncProject(project);
        }
        FeedbackRequest saved = feedbackRequestRepository.save(feedbackRequest);
        checkpointService.capture(project.getId(), "REVIEW_STATUS:" + status);
        return saved;
    }

    private FeedbackRequest requireFeedbackAccess(UUID id, User currentUser, boolean instructorOnly) {
        FeedbackRequest feedbackRequest = feedbackRequestRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Feedback request not found: " + id));
        if (currentUserService.isAdmin(currentUser)) {
            return feedbackRequest;
        }
        boolean isInstructor = feedbackRequest.getInstructor() != null
                && currentUser.getId().equals(feedbackRequest.getInstructor().getId());
        boolean isStudent = feedbackRequest.getStudent() != null
                && currentUser.getId().equals(feedbackRequest.getStudent().getId());
        if ((instructorOnly && isInstructor) || (!instructorOnly && (isInstructor || isStudent))) {
            return feedbackRequest;
        }
        throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Feedback access denied.");
    }

    private Map<UUID, Integer> submittedSectionVersions(FeedbackRequest request) {
        if (request.getSubmissionSnapshotJson() == null
                || request.getSubmissionSnapshotJson().isBlank()) {
            return Map.of();
        }
        try {
            JsonNode root = objectMapper.readTree(request.getSubmissionSnapshotJson());
            JsonNode papers = root.get("papers");
            if (papers == null || !papers.isArray()) {
                throw new IllegalStateException("Stored review snapshot has no papers array");
            }
            Map<UUID, Integer> versions = new HashMap<>();
            for (JsonNode paper : papers) {
                JsonNode sections = paper.get("sections");
                if (sections == null || !sections.isArray()) {
                    throw new IllegalStateException("Stored review snapshot has invalid sections");
                }
                for (JsonNode section : sections) {
                    UUID sectionId = UUID.fromString(section.path("id").asText());
                    JsonNode version = section.get("contentVersion");
                    if (version == null || !version.canConvertToInt()
                            || versions.putIfAbsent(sectionId, version.asInt()) != null) {
                        throw new IllegalStateException("Stored review snapshot has invalid section versions");
                    }
                }
            }
            return versions;
        } catch (JsonProcessingException | IllegalArgumentException exception) {
            throw new IllegalStateException("Stored review snapshot is invalid", exception);
        }
    }

    private PaperSection requireSectionInProject(UUID sectionId, Project project) {
        PaperSection section = paperSectionRepository.findById(sectionId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Paper section not found: " + sectionId));
        Project sectionProject = section.getDocument() != null ? section.getDocument().getProject() : null;
        if (sectionProject == null || !project.getId().equals(sectionProject.getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Section does not belong to feedback project.");
        }
        return section;
    }
}
