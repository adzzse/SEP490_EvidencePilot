package com.evidencepilot.service.impl;

import com.evidencepilot.dto.request.InstructorFeedbackRequest;
import com.evidencepilot.dto.request.SubmitReviewRequest;
import com.evidencepilot.dto.response.FeedbackRequestResponseDto;
import com.evidencepilot.dto.response.InstructorFeedbackResponseDto;
import com.evidencepilot.exception.ResourceNotFoundException;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.FeedbackRequest;
import com.evidencepilot.model.FeedbackStatus;
import com.evidencepilot.model.InstructorFeedback;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.SectionStandardEvaluation;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.ProjectRole;
import com.evidencepilot.model.enums.ProjectStatus;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.FeedbackRequestRepository;
import com.evidencepilot.repository.InstructorFeedbackRepository;
import com.evidencepilot.repository.PaperSectionRepository;
import com.evidencepilot.repository.ProjectRepository;
import com.evidencepilot.service.CurrentUserService;
import com.evidencepilot.service.CheckpointService;
import com.evidencepilot.service.FeedbackService;
import com.evidencepilot.service.PaperProcessingService;
import com.evidencepilot.service.SystemNotificationService;
import org.springframework.transaction.annotation.Transactional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
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
@Slf4j
public class FeedbackServiceImpl implements FeedbackService {

    private final FeedbackRequestRepository feedbackRequestRepository;
    private final InstructorFeedbackRepository instructorFeedbackRepository;
    private final PaperSectionRepository paperSectionRepository;
    private final DocumentRepository documentRepository;
    private final ProjectRepository projectRepository;
    private final CurrentUserService currentUserService;
    private final SystemNotificationService systemNotificationService;
    private final PaperProcessingService paperProcessingService;
    private final CheckpointService checkpointService;
    private final ProjectCollectionService projectCollectionService;
    // Optional: may be absent in tests without the bean
    private final org.springframework.beans.factory.ObjectProvider<com.evidencepilot.repository.SectionStandardEvaluationRepository> sectionStandardEvaluationRepositoryProvider;

    private com.evidencepilot.repository.SectionStandardEvaluationRepository getSectionStandardEvaluationRepository() {
        return sectionStandardEvaluationRepositoryProvider.getIfAvailable();
    }

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
    @Transactional
    public FeedbackRequestResponseDto submitForReview(UUID projectId, SubmitReviewRequest request) {
        User currentUser = currentUserService.requireCurrentUser();
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Project not found: " + projectId));
        currentUserService.requireProjectWriteAccess(currentUser, project);
        if (project.getStatus() == ProjectStatus.SUBMITTED_FOR_REVIEW) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Project is already in review.");
        }
        if (project.getStatus() != ProjectStatus.ASSIGNED
                && project.getStatus() != ProjectStatus.IN_PROGRESS
                && project.getStatus() != ProjectStatus.RETURNED) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "Only ACTIVE or RETURNED projects can be submitted for review.");
        }

        UUID instructorId = request != null ? request.instructorId() : null;
        User instructor = project.getInstructor();
        if (instructorId != null
                && (instructor == null || !instructorId.equals(instructor.getId()))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Instructor does not match the project's assigned instructor.");
        }
        if (instructor == null || instructor.getRole() != UserRole.INSTRUCTOR) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Project has no instructor.");
        }
        boolean isStudentMember = project.getProjectMembers() != null
                && project.getProjectMembers().stream()
                .anyMatch(pm -> pm.getUser() != null
                        && currentUser.getId().equals(pm.getUser().getId())
                        && pm.getRole() != ProjectRole.INSTRUCTOR);
        User student = currentUser.getRole() == UserRole.STUDENT && isStudentMember
                ? currentUser : project.getStudent();
        if (student == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Project has no student.");
        }

        List<Document> papers = documentRepository
                .findByProjectIdAndDocTypeAndActiveTrue(project.getId(), DocumentType.PAPER);
        String validationJson = null;
        if (!papers.isEmpty()) {
            try {
                var validation = paperProcessingService.validateSections(papers.get(0).getId());
                validationJson = new com.fasterxml.jackson.databind.ObjectMapper()
                        .writeValueAsString(validation);
            } catch (Exception e) {
                log.warn("Section validation failed for project {}: {}", project.getId(), e.getMessage());
            }
        }

        // Absolute submission gate: STALE/UNTESTED/SYSTEM_ERROR block entirely; FAILED requires flagged=true
        if (!papers.isEmpty()) {
            List<PaperSection> sectionsForGate = paperSectionRepository
                    .findByDocumentIdOrderBySectionOrderAsc(papers.get(0).getId())
                    .stream().filter(PaperSection::isActive).toList();
            if (!sectionsForGate.isEmpty()) {
                var evalRepo = getSectionStandardEvaluationRepository();
                if (evalRepo != null) {
                    boolean hasStaleOrUntested = false;
                    boolean hasSystemError = false;
                    boolean hasFailed = false;
                    String staleDetail = null;
                    for (PaperSection s : sectionsForGate) {
                        var opt = evalRepo.findTopBySectionIdOrderByUpdatedAtDesc(s.getId());
                        if (opt.isEmpty()) {
                            hasStaleOrUntested = true;
                            staleDetail = s.getId().toString();
                            break;
                        }
                        String status = opt.get().getStatus();
                        if (SectionStandardEvaluation.STATUS_STALE.equals(status)
                                || SectionStandardEvaluation.STATUS_SYSTEM_ERROR.equals(status)) {
                            if (SectionStandardEvaluation.STATUS_SYSTEM_ERROR.equals(status)) hasSystemError = true;
                            hasStaleOrUntested = true;
                            staleDetail = s.getId().toString();
                            break;
                        }
                        if (SectionStandardEvaluation.STATUS_FAILED.equals(status)) {
                            hasFailed = true;
                        }
                    }
                    if (hasStaleOrUntested) {
                        // STALE/UNTESTED/SYSTEM_ERROR cannot be bypassed with flagged
                        throw new ResponseStatusException(HttpStatus.CONFLICT,
                                "STALE_SECTIONS: section " + staleDetail + " requires a fresh Standard Check. Run evaluation before submit. flagged does not bypass stale/system_error.");
                    }
                    if (hasFailed && !Boolean.TRUE.equals(request != null ? request.flagged() : null)) {
                        throw new ResponseStatusException(HttpStatus.CONFLICT,
                                "FAILED_SECTIONS: one or more sections below passThreshold — submit with flagged=true to force (flagged submission).");
                    }
                }
            }
        }

        FeedbackRequest feedbackRequest = new FeedbackRequest();
        feedbackRequest.setProject(project);
        feedbackRequest.setStudent(student);
        feedbackRequest.setInstructor(instructor);
        feedbackRequest.setStatus(FeedbackStatus.PENDING);
        LocalDateTime now = LocalDateTime.now();
        feedbackRequest.setRequestedAt(now);
        feedbackRequest.setUpdatedAt(now);
        feedbackRequest.setSectionValidation(validationJson);
        feedbackRequest.setFlagged(Boolean.TRUE.equals(request != null ? request.flagged() : null));
        // Snapshot evaluations for audit
        try {
            if (!papers.isEmpty()) {
                var evalRepo = getSectionStandardEvaluationRepository();
                if (evalRepo != null) {
                    var evals = evalRepo.findByDocumentId(papers.get(0).getId());
                    feedbackRequest.setStandardSnapshotJson(new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(
                            evals.stream().map(e -> Map.of(
                                    "sectionId", e.getSectionId().toString(),
                                    "status", e.getStatus(),
                                    "scorePercent", e.getScorePercent() == null ? 0 : e.getScorePercent(),
                                    "passThreshold", e.getPassThreshold()
                            )).toList()));
                }
            }
        } catch (Exception e) {
            log.warn("Could not snapshot standard evaluations for project {}", project.getId());
        }

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

        InstructorFeedback feedback = new InstructorFeedback();
        feedback.setRequest(feedbackRequest);
        feedback.setSection(section);
        feedback.setInstructor(currentUserService.isAdmin(currentUser)
                ? feedbackRequest.getInstructor()
                : currentUser);
        feedback.setLineReference(request.lineReference());
        feedback.setContent(request.content());
        feedback.setSectionVersion(section.getVersion());
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
        return InstructorFeedbackResponseDto.fromEntity(saved, section, section.getVersion());
    }

    @Override
    @Transactional
    public List<InstructorFeedbackResponseDto> getFeedbackItems(UUID feedbackRequestId) {
        User currentUser = currentUserService.requireCurrentUser();
        requireFeedbackAccess(feedbackRequestId, currentUser, false);
        List<InstructorFeedback> items = instructorFeedbackRepository.findByRequestId(feedbackRequestId);
        List<PaperSection> sections = paperSectionRepository.findAllById(
                items.stream().map(f -> f.getSection().getId()).distinct().toList());
        Map<UUID, PaperSection> sectionsById = new HashMap<>();
        sections.forEach(s -> sectionsById.put(s.getId(), s));
        return items.stream()
                .map(f -> {
                    PaperSection section = sectionsById.get(f.getSection().getId());
                    return InstructorFeedbackResponseDto.fromEntity(f, section,
                            section != null ? section.getVersion() : null);
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
        return InstructorFeedbackResponseDto.fromEntity(saved, feedback.getSection(), feedback.getSection().getVersion());
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
        if (feedbackRequest.getProject().getStatus().isReadOnly()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Project is read-only.");
        }
        ProjectStatus currentProjectStatus = feedbackRequest.getProject().getStatus();
        if (currentProjectStatus != projectStatus && !currentProjectStatus.canTransitionTo(projectStatus)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Illegal project transition from " + currentProjectStatus + " to " + projectStatus + ".");
        }
        feedbackRequest.setStatus(status);
        feedbackRequest.setUpdatedAt(LocalDateTime.now());
        Project project = feedbackRequest.getProject();
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
