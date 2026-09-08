package com.evidencepilot.service.impl;

import com.evidencepilot.dto.request.FeedbackReplyRequest;
import com.evidencepilot.dto.request.FeedbackStateRequest;
import com.evidencepilot.dto.request.InstructorFeedbackRequest;
import com.evidencepilot.dto.request.SubmitReviewRequest;
import com.evidencepilot.dto.response.FeedbackMessageResponseDto;
import com.evidencepilot.dto.response.FeedbackRequestResponseDto;
import com.evidencepilot.dto.response.InstructorFeedbackResponseDto;
import com.evidencepilot.dto.response.ReviewSubmissionSnapshotResponse;
import com.evidencepilot.model.FeedbackReply;
import com.evidencepilot.model.FeedbackRequest;
import com.evidencepilot.model.FeedbackStatus;
import com.evidencepilot.model.InstructorFeedback;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.ProjectMember;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.AccountStatus;
import com.evidencepilot.model.enums.FeedbackReplyAuthorRole;
import com.evidencepilot.model.enums.FeedbackThreadState;
import com.evidencepilot.model.enums.ProjectRole;
import com.evidencepilot.model.enums.ProjectStatus;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.FeedbackReplyRepository;
import com.evidencepilot.repository.FeedbackRequestRepository;
import com.evidencepilot.repository.InstructorFeedbackRepository;
import com.evidencepilot.repository.PaperSectionRepository;
import com.evidencepilot.repository.ProjectRepository;
import com.evidencepilot.service.CheckpointService;
import com.evidencepilot.service.CurrentUserService;
import com.evidencepilot.service.FeedbackAnchorService;
import com.evidencepilot.service.FeedbackService;
import com.evidencepilot.service.SubmissionReadinessService;
import com.evidencepilot.service.SystemNotificationService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class FeedbackServiceImpl implements FeedbackService {

    private final FeedbackRequestRepository feedbackRequestRepository;
    private final InstructorFeedbackRepository instructorFeedbackRepository;
    private final FeedbackReplyRepository feedbackReplyRepository;
    private final PaperSectionRepository paperSectionRepository;
    private final ProjectRepository projectRepository;
    private final CurrentUserService currentUserService;
    private final SystemNotificationService systemNotificationService;
    private final CheckpointService checkpointService;
    private final ProjectCollectionService projectCollectionService;
    private final SubmissionReadinessService submissionReadinessService;
    private final ObjectMapper objectMapper;
    private final FeedbackAnchorService feedbackAnchorService;

    @Override
    @Transactional(readOnly = true)
    public List<FeedbackRequestResponseDto> findAllForCurrentUser() {
        User currentUser = currentUserService.requireCurrentUser();
        List<FeedbackRequest> requests;
        if (isAdmin(currentUser)) {
            requests = feedbackRequestRepository.findAll(Sort.by(Sort.Direction.DESC, "requestedAt"));
        } else if (isInstructor(currentUser)) {
            requests = feedbackRequestRepository.findByInstructorIdOrderByRequestedAtDesc(currentUser.getId());
        } else {
            requests = feedbackRequestRepository.findVisibleToStudent(currentUser.getId());
        }
        return requests.stream().map(FeedbackRequestResponseDto::fromEntity).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public ReviewSubmissionSnapshotResponse getSubmissionSnapshot(UUID feedbackRequestId) {
        User currentUser = currentUserService.requireCurrentUser();
        FeedbackRequest request = requireFeedbackAccess(feedbackRequestId, currentUser, false);
        if (request.getSubmissionSnapshotJson() == null || request.getSubmissionSnapshotJson().isBlank()) {
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
                .orElseThrow(() -> notFound("Project", projectId));
        currentUserService.requireProjectWriteAccess(currentUser, project);
        if (request == null || request.expectedSubmissionFingerprint() == null) {
            throw badRequest("expectedSubmissionFingerprint is required.");
        }
        User instructor = project.getInstructor();
        if (instructor == null) throw badRequest("Project has no instructor.");
        SubmissionReadinessService.Assessment assessment = submissionReadinessService
                .requireReadyForSubmit(project, currentUser, request.expectedSubmissionFingerprint());

        LocalDateTime now = LocalDateTime.now();
        FeedbackRequest feedbackRequest = new FeedbackRequest();
        feedbackRequest.setProject(project);
        feedbackRequest.setStudent(currentUser);
        feedbackRequest.setInstructor(instructor);
        feedbackRequest.setStatus(FeedbackStatus.PENDING);
        feedbackRequest.setRequestedAt(now);
        feedbackRequest.setUpdatedAt(now);
        feedbackRequest.setFlagged(false);
        feedbackRequest.setSubmissionSnapshotJson(submissionReadinessService.snapshot(
                assessment, project, currentUser, instructor, now));

        project.setStatus(ProjectStatus.SUBMITTED_FOR_REVIEW);
        project.setUpdatedAt(now);
        projectRepository.save(project);
        FeedbackRequest saved = feedbackRequestRepository.save(feedbackRequest);
        checkpointService.capture(projectId, "SUBMIT_FOR_REVIEW");
        systemNotificationService.createNotification(
                instructor, currentUser, "REVIEW_SUBMITTED", saved.getId(),
                currentUser.getEmail() + " submitted project \"" + project.getTitle() + "\" for review.");
        return FeedbackRequestResponseDto.fromEntity(saved);
    }

    /** Root feedback is a server-side draft until the review request is returned. */
    @Override
    @Transactional
    public InstructorFeedbackResponseDto comment(UUID feedbackRequestId, InstructorFeedbackRequest request) {
        User currentUser = currentUserService.requireCurrentUser();
        FeedbackRequest feedbackRequest = requireFeedbackAccessForUpdate(feedbackRequestId, currentUser, true);
        requirePendingReview(feedbackRequest);
        if (!hasSnapshot(feedbackRequest)) {
            throw conflict("Feedback requires a verifiable submitted review snapshot.");
        }
        PaperSection section = requireSectionInProject(request.sectionId(), feedbackRequest.getProject());
        Map<UUID, Integer> submittedVersions = submittedSectionVersions(feedbackRequest);
        if (hasSnapshot(feedbackRequest) && !submittedVersions.containsKey(section.getId())) {
            throw badRequest("Section was not part of this review submission.");
        }

        InstructorFeedback feedback = new InstructorFeedback();
        feedback.setRequest(feedbackRequest);
        feedback.setSection(section);
        feedback.setInstructor(isAdmin(currentUser) ? feedbackRequest.getInstructor() : currentUser);
        feedback.setLineReference(request.lineReference());
        feedback.setContent(request.content());
        feedback.setSectionVersion(submittedVersions.getOrDefault(section.getId(), section.getVersion()));
        feedback.setCreatedAt(LocalDateTime.now());
        feedback.setUpdatedAt(feedback.getCreatedAt());
        feedback.setUpdatedBy(currentUser);
        feedback.setAnswered(false);
        feedback.setThreadState(FeedbackThreadState.OPEN);
        feedbackAnchorService.initialize(feedback, request.anchor());
        InstructorFeedback saved = instructorFeedbackRepository.save(feedback);
        return response(saved, currentUser, List.of());
    }

    @Override
    @Transactional(readOnly = true)
    public List<InstructorFeedbackResponseDto> getFeedbackItems(UUID feedbackRequestId) {
        User currentUser = currentUserService.requireCurrentUser();
        FeedbackRequest request = requireFeedbackAccess(feedbackRequestId, currentUser, false);
        boolean instructorView = isInstructorViewer(currentUser, request);
        List<InstructorFeedback> roots = instructorFeedbackRepository.findByRequestId(feedbackRequestId);
        if (!instructorView) roots = roots.stream().filter(FeedbackServiceImpl::isPublished).toList();
        Map<UUID, List<FeedbackReply>> replies = repliesByFeedback(roots);
        return roots.stream().map(root -> response(root, currentUser,
                replies.getOrDefault(root.getId(), List.of()))).toList();
    }

    @Override
    @Transactional
    public InstructorFeedbackResponseDto updateFeedbackItem(UUID feedbackItemId, InstructorFeedbackRequest request) {
        User currentUser = currentUserService.requireCurrentUser();
        InstructorFeedback feedback = requireOwnedFeedback(feedbackItemId, currentUser);
        requireRootDraftEditable(feedback);
        if (!feedback.getSection().getId().equals(request.sectionId())) {
            throw badRequest("Feedback section cannot be changed.");
        }
        boolean anchorChanged = !Objects.equals(feedback.getLineReference(), request.lineReference())
                || request.anchor() != null;
        feedback.setContent(request.content());
        feedback.setLineReference(request.lineReference());
        if (anchorChanged) feedbackAnchorService.initialize(feedback, request.anchor());
        feedback.setUpdatedAt(LocalDateTime.now());
        feedback.setUpdatedBy(currentUser);
        instructorFeedbackRepository.saveAndFlush(feedback);
        return response(feedback, currentUser, repliesFor(feedback));
    }

    @Override
    @Transactional
    public void deleteFeedbackItem(UUID feedbackItemId) {
        User currentUser = currentUserService.requireCurrentUser();
        InstructorFeedback feedback = requireOwnedFeedback(feedbackItemId, currentUser);
        requireRootDraftEditable(feedback);
        instructorFeedbackRepository.delete(feedback);
    }

    @Override
    @Transactional
    public InstructorFeedbackResponseDto answerFeedback(
            UUID feedbackItemId, String answerContent, UUID idempotencyKey) {
        User currentUser = currentUserService.requireCurrentUser();
        InstructorFeedback feedback = requireFeedbackForUpdate(feedbackItemId);
        Project project = feedback.getRequest().getProject();
        if (!isStudentMember(currentUser, project)) {
            throw forbidden("Only a current project student can answer feedback.");
        }
        if (!isPublished(feedback)) throw conflict("Feedback is not published yet.");
        if (Objects.requireNonNullElse(feedback.getThreadState(), FeedbackThreadState.OPEN) != FeedbackThreadState.OPEN) {
            throw conflict("Feedback is already done.");
        }
        if (project.getStatus().isReadOnly()) throw conflict("Project is read-only.");
        if (!isCurrentAssignee(currentUser, feedback.getSection(), project)) {
            throw forbidden("You are not assigned to this section.");
        }

        throw conflict("Feedback replies are closed. Revise the paper and submit a new review round.");
    }

    @Override
    @Transactional
    public InstructorFeedbackResponseDto createInstructorReply(UUID feedbackItemId, FeedbackReplyRequest request) {
        User currentUser = currentUserService.requireCurrentUser();
        InstructorFeedback feedback = requireFeedbackForUpdate(feedbackItemId);
        requireInstructorThreadAccess(feedback, currentUser);
        throw conflict("Feedback replies are closed. Revise the paper and submit a new review round.");
    }

    @Override
    @Transactional
    public InstructorFeedbackResponseDto updateInstructorReply(
            UUID feedbackItemId, UUID replyId, FeedbackReplyRequest request) {
        User currentUser = currentUserService.requireCurrentUser();
        InstructorFeedback feedback = requireFeedbackForUpdate(feedbackItemId);
        requireInstructorThreadAccess(feedback, currentUser);
        FeedbackReply reply = feedbackReplyRepository.findByIdAndFeedbackIdForUpdate(feedbackItemId, replyId)
                .orElseThrow(() -> notFound("Feedback reply", replyId));
        requireDraftReplyOwner(reply, currentUser);
        throw conflict("Feedback replies are closed. Revise the paper and submit a new review round.");
    }

    @Override
    @Transactional
    public void deleteInstructorReply(UUID feedbackItemId, UUID replyId) {
        User currentUser = currentUserService.requireCurrentUser();
        InstructorFeedback feedback = requireFeedbackForUpdate(feedbackItemId);
        requireInstructorThreadAccess(feedback, currentUser);
        FeedbackReply reply = feedbackReplyRepository.findByIdAndFeedbackIdForUpdate(feedbackItemId, replyId)
                .orElseThrow(() -> notFound("Feedback reply", replyId));
        requireDraftReplyOwner(reply, currentUser);
        feedbackReplyRepository.delete(reply);
    }

    @Override
    @Transactional
    public InstructorFeedbackResponseDto prepareFeedbackState(UUID feedbackItemId, FeedbackStateRequest request) {
        User currentUser = currentUserService.requireCurrentUser();
        InstructorFeedback feedback = requireFeedbackForUpdate(feedbackItemId);
        requireInstructorThreadAccess(feedback, currentUser);
        long revision = revision(feedback);
        if (!Objects.equals(request.expectedRevision(), revision)) {
            throw conflict("Feedback changed; reload it before changing its state.");
        }
        if (request.state() == feedback.getThreadState()) {
            feedback.setPendingState(null);
            feedback.setPendingStateOptVersion(null);
        } else {
            feedback.setPendingState(request.state());
            // Hibernate increments @Version for this pending write. Return/approve must see that exact version.
            feedback.setPendingStateOptVersion(revision + 1);
        }
        instructorFeedbackRepository.saveAndFlush(feedback);
        return response(feedback, currentUser, repliesFor(feedback));
    }

    @Override
    @Transactional
    public FeedbackRequestResponseDto updateStatus(UUID feedbackRequestId, String status) {
        FeedbackStatus next = parseStatus(status);
        User currentUser = currentUserService.requireCurrentUser();
        return switch (next) {
            case RETURNED -> returnReview(feedbackRequestId, currentUser);
            case REVIEWED -> approveReview(feedbackRequestId, currentUser);
            case REJECTED -> rejectReview(feedbackRequestId, currentUser);
            case PENDING -> throw badRequest("Invalid status: " + status);
        };
    }

    private FeedbackRequestResponseDto returnReview(UUID id, User currentUser) {
        FeedbackRequest request = requireFeedbackAccessForUpdate(id, currentUser, true);
        Project project = lockProject(request);
        requireLatestRequest(request, project);
        if (request.getStatus() != FeedbackStatus.PENDING) {
            throw conflict("Only a PENDING review request can be returned.");
        }
        if (project.getStatus().isReadOnly()) throw conflict("Project is read-only.");

        List<InstructorFeedback> roots = instructorFeedbackRepository.findByRequestProjectIdForUpdate(project.getId());
        Map<UUID, List<FeedbackReply>> replies = repliesByFeedbackForUpdate(roots);
        if (replies.values().stream().flatMap(Collection::stream)
                .anyMatch(reply -> reply.getPublishedAt() == null && isInstructorReply(reply))) {
            throw conflict("Resolve legacy reply drafts before returning. Copy them into round feedback or delete them.");
        }
        requireFreshPendingStates(roots);
        LocalDateTime now = LocalDateTime.now();
        Set<UUID> feedbackWithNewInstructorContent = new LinkedHashSet<>();

        for (InstructorFeedback root : roots) {
            if (root.getRequest().getId().equals(request.getId()) && !isPublished(root)) {
                root.setPublishedAt(now);
                root.setUpdatedAt(now);
                root.setUpdatedBy(currentUser);
                feedbackWithNewInstructorContent.add(root.getId());
            }
        }
        applyPendingStates(roots, currentUser, now);
        for (InstructorFeedback root : roots) {
            syncLegacyAnswerProjection(root, replies.getOrDefault(root.getId(), List.of()));
            instructorFeedbackRepository.save(root);
        }

        transition(request, project, FeedbackStatus.RETURNED, ProjectStatus.RETURNED, now);
        checkpointService.capture(project.getId(), "REVIEW_STATUS:RETURNED");
        notifyReturned(project, request, currentUser, roots, feedbackWithNewInstructorContent);
        return FeedbackRequestResponseDto.fromEntity(request);
    }

    private FeedbackRequestResponseDto approveReview(UUID id, User currentUser) {
        FeedbackRequest request = requireFeedbackAccessForUpdate(id, currentUser, true);
        Project project = lockProject(request);
        requireLatestRequest(request, project);
        if (request.getStatus() != FeedbackStatus.PENDING && request.getStatus() != FeedbackStatus.RETURNED) {
            throw conflict("Approve requires the latest submitted review request.");
        }
        if (project.getStatus().isReadOnly()) throw conflict("Project is read-only.");

        List<InstructorFeedback> roots = instructorFeedbackRepository.findByRequestProjectIdForUpdate(project.getId());
        Map<UUID, List<FeedbackReply>> replies = repliesByFeedbackForUpdate(roots);
        if (hasInstructorDrafts(roots, replies)) {
            throw conflict("Publish or delete instructor drafts before approving.");
        }
        requireFreshPendingStates(roots);
        validateCurrentSubmissionSnapshot(request, project, currentUser);
        LocalDateTime now = LocalDateTime.now();
        applyPendingStates(roots, currentUser, now);
        if (roots.stream().anyMatch(root -> root.getThreadState() != FeedbackThreadState.DONE)) {
            throw conflict("Every feedback thread must be done before approving.");
        }
        for (InstructorFeedback root : roots) {
            instructorFeedbackRepository.save(root);
        }
        transition(request, project, FeedbackStatus.REVIEWED, ProjectStatus.APPROVED, now);
        checkpointService.capture(project.getId(), "REVIEW_STATUS:REVIEWED");
        return FeedbackRequestResponseDto.fromEntity(request);
    }

    private FeedbackRequestResponseDto rejectReview(UUID id, User currentUser) {
        FeedbackRequest request = requireFeedbackAccessForUpdate(id, currentUser, true);
        Project project = lockProject(request);
        requireLatestRequest(request, project);
        if (request.getStatus() != FeedbackStatus.PENDING && request.getStatus() != FeedbackStatus.RETURNED) {
            throw conflict("Illegal transition from " + request.getStatus() + " to REJECTED.");
        }
        if (project.getStatus().isReadOnly()) throw conflict("Project is read-only.");
        List<InstructorFeedback> roots = instructorFeedbackRepository.findByRequestProjectIdForUpdate(project.getId());
        if (hasInstructorDrafts(roots, repliesByFeedbackForUpdate(roots))) {
            throw conflict("Publish or delete instructor drafts before rejecting.");
        }
        LocalDateTime now = LocalDateTime.now();
        transition(request, project, FeedbackStatus.REJECTED, ProjectStatus.IN_PROGRESS, now);
        checkpointService.capture(project.getId(), "REVIEW_STATUS:REJECTED");
        if (request.getStudent() != null) {
            systemNotificationService.createNotification(
                    request.getStudent(), currentUser, "REVIEW_STATUS_CHANGED", request.getId(),
                    "Review status for project \"" + project.getTitle() + "\" changed to REJECTED.");
        }
        return FeedbackRequestResponseDto.fromEntity(request);
    }

    private void transition(FeedbackRequest request, Project project, FeedbackStatus next,
                            ProjectStatus projectStatus, LocalDateTime now) {
        if (project.getStatus() != projectStatus && !project.getStatus().canTransitionTo(projectStatus)) {
            throw conflict("Illegal project transition from " + project.getStatus() + " to " + projectStatus + ".");
        }
        request.setStatus(next);
        request.setUpdatedAt(now);
        project.setStatus(projectStatus);
        project.setUpdatedAt(now);
        projectRepository.save(project);
        feedbackRequestRepository.save(request);
        if (projectStatus == ProjectStatus.IN_PROGRESS || projectStatus == ProjectStatus.RETURNED) {
            projectCollectionService.syncProject(project);
        }
    }

    private void notifyReturned(Project project, FeedbackRequest request, User actor,
                                Collection<InstructorFeedback> roots, Set<UUID> feedbackIds) {
        String projectMessage = "Instructor returned project \"" + project.getTitle() + "\" for revision.";
        for (User student : activeStudentMembers(project)) {
            systemNotificationService.createNotification(
                    student, actor, "REVIEW_RETURNED", request.getId(), projectMessage);
        }
        for (InstructorFeedback root : roots) {
            if (!feedbackIds.contains(root.getId())) continue;
            User assignee = root.getSection() == null ? null : root.getSection().getAssignedUser();
            if (!isCurrentAssignee(assignee, root.getSection(), project)) continue;
            systemNotificationService.createNotification(
                    assignee, actor, "INSTRUCTOR_FEEDBACK_PUBLISHED", request.getId(), root.getId(),
                    "Instructor published feedback for \"" + root.getSection().getSectionTitle()
                            + "\" in project \"" + project.getTitle() + "\".");
        }
    }

    private InstructorFeedback requireFeedbackForUpdate(UUID feedbackId) {
        return instructorFeedbackRepository.findByIdForUpdate(feedbackId)
                .orElseThrow(() -> notFound("Instructor feedback", feedbackId));
    }

    private FeedbackRequest requireFeedbackAccessForUpdate(UUID id, User currentUser, boolean instructorOnly) {
        FeedbackRequest request = feedbackRequestRepository.findByIdForUpdate(id)
                .orElseThrow(() -> notFound("Feedback request", id));
        requireFeedbackAccess(request, currentUser, instructorOnly);
        return request;
    }

    private FeedbackRequest requireFeedbackAccess(UUID id, User currentUser, boolean instructorOnly) {
        FeedbackRequest request = feedbackRequestRepository.findById(id)
                .orElseThrow(() -> notFound("Feedback request", id));
        requireFeedbackAccess(request, currentUser, instructorOnly);
        return request;
    }

    private void requireFeedbackAccess(FeedbackRequest request, User currentUser, boolean instructorOnly) {
        if (isAdmin(currentUser)) return;
        boolean instructor = request.getInstructor() != null
                && sameUser(request.getInstructor(), currentUser) && isInstructor(currentUser);
        boolean student = isStudentMember(currentUser, request.getProject());
        if ((instructorOnly && instructor) || (!instructorOnly && (instructor || student))) return;
        throw forbidden("Feedback access denied.");
    }

    private InstructorFeedback requireOwnedFeedback(UUID id, User currentUser) {
        InstructorFeedback feedback = instructorFeedbackRepository.findById(id)
                .orElseThrow(() -> notFound("Instructor feedback", id));
        if (!isAdmin(currentUser) && !sameUser(feedback.getInstructor(), currentUser)) {
            throw forbidden("Feedback access denied.");
        }
        return feedback;
    }

    private void requireRootDraftEditable(InstructorFeedback feedback) {
        if (isPublished(feedback)) throw conflict("Published feedback is immutable.");
        requirePendingReview(feedback.getRequest());
    }

    private void requirePendingReview(FeedbackRequest request) {
        if (request.getStatus() != FeedbackStatus.PENDING) throw conflict("Feedback request closed.");
        if (request.getProject().getStatus().isReadOnly()) throw conflict("Project is read-only.");
    }

    private void requireInstructorThreadAccess(InstructorFeedback feedback, User currentUser) {
        requireFeedbackAccess(feedback.getRequest(), currentUser, true);
        if (!isPublished(feedback)) throw conflict("Feedback is not published yet.");
        if (feedback.getRequest().getProject().getStatus().isReadOnly()) throw conflict("Project is read-only.");
    }

    private void requireDraftReplyOwner(FeedbackReply reply, User currentUser) {
        if (reply.getPublishedAt() != null) throw conflict("Published feedback replies are immutable.");
        if (!isInstructorReply(reply) || (!isAdmin(currentUser) && !sameUser(reply.getAuthor(), currentUser))) {
            throw forbidden("Feedback reply access denied.");
        }
    }

    private void requireLatestRequest(FeedbackRequest request, Project project) {
        List<FeedbackRequest> requests = feedbackRequestRepository.findByProjectIdOrderByRequestedAtDesc(project.getId());
        if (requests.isEmpty() || !Objects.equals(requests.getFirst().getId(), request.getId())) {
            throw conflict("Only the latest review request can be updated.");
        }
    }

    private Project lockProject(FeedbackRequest request) {
        Project project = projectRepository.findByIdForUpdate(request.getProject().getId())
                .orElseThrow(() -> notFound("Project", request.getProject().getId()));
        request.setProject(project);
        return project;
    }

    private void requireFreshPendingStates(Collection<InstructorFeedback> roots) {
        for (InstructorFeedback root : roots) {
            if (root.getPendingState() != null
                    && !Objects.equals(root.getPendingStateOptVersion(), revision(root))) {
                throw conflict("Feedback changed after its pending state was prepared; reload before returning or approving.");
            }
        }
    }

    private void applyPendingStates(Collection<InstructorFeedback> roots, User actor, LocalDateTime now) {
        for (InstructorFeedback root : roots) {
            if (root.getPendingState() == null) continue;
            FeedbackThreadState pending = root.getPendingState();
            root.setPendingState(null);
            root.setPendingStateOptVersion(null);
            if (pending != root.getThreadState()) {
                root.setThreadState(pending);
                root.setStateChangedAt(now);
                root.setStateChangedBy(actor);
            }
        }
    }

    private boolean hasInstructorDrafts(Collection<InstructorFeedback> roots,
                                        Map<UUID, List<FeedbackReply>> replies) {
        return roots.stream().anyMatch(root -> !isPublished(root)
                || replies.getOrDefault(root.getId(), List.of()).stream()
                .anyMatch(reply -> reply.getPublishedAt() == null && isInstructorReply(reply)));
    }

    private void validateCurrentSubmissionSnapshot(FeedbackRequest request, Project project, User currentUser) {
        if (!hasSnapshot(request)) throw conflict("Approve requires a verifiable submitted review snapshot.");
        SubmissionReadinessService.Assessment assessment = submissionReadinessService.assess(project, currentUser);
        if (assessment == null) throw conflict("Could not verify the submitted review snapshot.");
        try {
            JsonNode snapshot = objectMapper.readTree(request.getSubmissionSnapshotJson());
            if (!sameUuid(snapshot.path("projectId").asText(null), project.getId())) {
                throw conflict("Submitted review snapshot does not match this project.");
            }
            Map<UUID, JsonNode> snapshotPapers = indexedById(snapshot.path("papers"));
            if (snapshotPapers.size() != assessment.papers().size()) {
                throw conflict("Submitted review snapshot no longer matches current papers.");
            }
            for (var paper : assessment.papers()) {
                JsonNode savedPaper = snapshotPapers.get(paper.getId());
                if (savedPaper == null
                        || !Objects.equals(savedPaper.path("title").asText(null), paper.getTitle())
                        || !Objects.equals(savedPaper.path("processingStatus").asText(null),
                        String.valueOf(paper.getProcessingStatus()))) {
                    throw conflict("Submitted review snapshot no longer matches current papers.");
                }
                List<PaperSection> currentSections = assessment.sectionsByPaper()
                        .getOrDefault(paper.getId(), List.of());
                Map<UUID, JsonNode> snapshotSections = indexedById(savedPaper.path("sections"));
                if (snapshotSections.size() != currentSections.size()) {
                    throw conflict("Submitted review snapshot no longer matches current sections.");
                }
                for (PaperSection section : currentSections) {
                    JsonNode savedSection = snapshotSections.get(section.getId());
                    if (savedSection == null
                            || !Objects.equals(savedSection.path("title").asText(null), section.getSectionTitle())
                            || !Objects.equals(savedSection.path("order").isMissingNode() ? null
                                    : savedSection.path("order").asInt(), section.getSectionOrder())
                            || !Objects.equals(savedSection.path("contentTex").asText(null), section.getContentTex())
                            || !Objects.equals(savedSection.path("contentVersion").isMissingNode() ? null
                                    : savedSection.path("contentVersion").asInt(), section.getVersion())
                            || !sameUuid(savedSection.path("assignedUserId").asText(null),
                                    section.getAssignedUser() == null ? null : section.getAssignedUser().getId())) {
                        throw conflict("Submitted review snapshot no longer matches current section content.");
                    }
                }
            }
        } catch (JsonProcessingException | IllegalArgumentException exception) {
            throw conflict("Submitted review snapshot is invalid.");
        }
    }

    private Map<UUID, JsonNode> indexedById(JsonNode values) {
        if (!values.isArray()) throw new IllegalArgumentException("Expected array");
        Map<UUID, JsonNode> indexed = new HashMap<>();
        for (JsonNode value : values) {
            UUID id = UUID.fromString(value.path("id").asText());
            if (indexed.putIfAbsent(id, value) != null) throw new IllegalArgumentException("Duplicate id");
        }
        return indexed;
    }

    private Map<UUID, Integer> submittedSectionVersions(FeedbackRequest request) {
        if (!hasSnapshot(request)) return Map.of();
        try {
            Map<UUID, Integer> versions = new HashMap<>();
            JsonNode snapshot = objectMapper.readTree(request.getSubmissionSnapshotJson());
            if (snapshot == null || snapshot.path("schemaVersion").asInt() != 1
                    || !request.getProject().getId().toString().equals(snapshot.path("projectId").asText())
                    || !snapshot.path("papers").isArray() || snapshot.path("papers").isEmpty()) {
                throw new IllegalArgumentException("Invalid snapshot");
            }
            for (JsonNode paper : snapshot.path("papers")) {
                if (!paper.has("title") || !(paper.path("title").isTextual() || paper.path("title").isNull())
                        || !paper.path("sections").isArray()
                        || paper.path("sections").isEmpty()) throw new IllegalArgumentException("Invalid paper");
                for (JsonNode section : paper.path("sections")) {
                    UUID sectionId = UUID.fromString(section.path("id").asText());
                    JsonNode version = section.get("contentVersion");
                    if (version == null || !version.isIntegralNumber() || !version.canConvertToInt()
                            || !section.path("title").isTextual() || !section.path("contentTex").isTextual()
                            || !section.path("order").isIntegralNumber()
                            || versions.putIfAbsent(sectionId, version.asInt()) != null) {
                        throw new IllegalArgumentException("Invalid section version");
                    }
                }
            }
            return versions;
        } catch (JsonProcessingException | IllegalArgumentException exception) {
            throw conflict("Stored review snapshot is invalid.");
        }
    }

    private PaperSection requireSectionInProject(UUID sectionId, Project project) {
        PaperSection section = paperSectionRepository.findById(sectionId)
                .orElseThrow(() -> notFound("Paper section", sectionId));
        Project sectionProject = section.getDocument() == null ? null : section.getDocument().getProject();
        if (sectionProject == null || !Objects.equals(project.getId(), sectionProject.getId())) {
            throw badRequest("Section does not belong to feedback project.");
        }
        return section;
    }

    private InstructorFeedbackResponseDto response(InstructorFeedback feedback, User viewer,
                                                   List<FeedbackReply> replies) {
        PaperSection section = feedback.getSection();
        Project project = feedback.getRequest().getProject();
        boolean instructorView = isInstructorViewer(viewer, feedback.getRequest());
        boolean published = isPublished(feedback);
        FeedbackThreadState visibleState = instructorView ? effectiveState(feedback)
                : Objects.requireNonNullElse(feedback.getThreadState(), FeedbackThreadState.OPEN);
        boolean canManageState = instructorView && published && !project.getStatus().isReadOnly();
        boolean canMarkDone = canManageState && visibleState == FeedbackThreadState.OPEN;
        boolean canReopen = canManageState && visibleState == FeedbackThreadState.DONE;
        boolean canEdit = !published && !project.getStatus().isReadOnly()
                && feedback.getRequest().getStatus() == FeedbackStatus.PENDING
                && (isAdmin(viewer) || sameUser(feedback.getInstructor(), viewer));
        List<FeedbackMessageResponseDto> messages = conversation(feedback, replies, instructorView);
        return InstructorFeedbackResponseDto.fromConversation(
                feedback, section, section == null ? null : section.getVersion(),
                section == null ? null : feedbackAnchorService.resolve(feedback, section.getContentTex(), section.getVersion()),
                false, false, canMarkDone, canReopen, canEdit, canEdit,
                instructorView ? feedback.getPendingState() : null, messages);
    }

    private List<FeedbackMessageResponseDto> conversation(InstructorFeedback feedback,
                                                           List<FeedbackReply> replies,
                                                           boolean instructorView) {
        List<FeedbackMessageResponseDto> messages = new ArrayList<>();
        if (instructorView || isPublished(feedback)) {
            messages.add(new FeedbackMessageResponseDto(
                    feedback.getId(), "ROOT", idOf(feedback.getInstructor()), roleOf(feedback.getInstructor()).name(),
                    displayName(feedback.getInstructor()), feedback.getContent(), feedback.getCreatedAt(),
                    feedback.getPublishedAt(), isPublished(feedback) ? feedback.getRequest().getId() : null,
                    !isPublished(feedback)));
        }
        replies.stream()
                .filter(reply -> instructorView || reply.getPublishedAt() != null)
                .sorted(Comparator
                        .comparing((FeedbackReply reply) -> reply.getPublishedAt() == null)
                        .thenComparing(reply -> reply.getPublishedAt() == null ? reply.getCreatedAt() : reply.getPublishedAt(),
                                Comparator.nullsLast(Comparator.naturalOrder())))
                .forEach(reply -> messages.add(new FeedbackMessageResponseDto(
                        reply.getId(), "REPLY", idOf(reply.getAuthor()), reply.getAuthorRole().name(),
                        displayName(reply.getAuthor()), reply.getContent(), reply.getCreatedAt(), reply.getPublishedAt(),
                        reply.getPublishedRequest() == null ? null : reply.getPublishedRequest().getId(),
                        reply.getPublishedAt() == null)));
        return List.copyOf(messages);
    }

    private Map<UUID, List<FeedbackReply>> repliesByFeedback(Collection<InstructorFeedback> roots) {
        return groupReplies(roots, false);
    }

    private Map<UUID, List<FeedbackReply>> repliesByFeedbackForUpdate(Collection<InstructorFeedback> roots) {
        return groupReplies(roots, true);
    }

    private Map<UUID, List<FeedbackReply>> groupReplies(Collection<InstructorFeedback> roots, boolean forUpdate) {
        if (roots.isEmpty()) return Map.of();
        List<UUID> ids = roots.stream().map(InstructorFeedback::getId).filter(Objects::nonNull).toList();
        if (ids.isEmpty()) return Map.of();
        Map<UUID, List<FeedbackReply>> grouped = new HashMap<>();
        List<FeedbackReply> rows = forUpdate
                ? feedbackReplyRepository.findByFeedbackIdInForUpdate(ids)
                : feedbackReplyRepository.findByFeedbackIdInOrderByCreatedAtAsc(ids);
        for (FeedbackReply reply : nonNullList(rows)) {
            if (reply.getFeedback() != null) {
                grouped.computeIfAbsent(reply.getFeedback().getId(), ignored -> new ArrayList<>()).add(reply);
            }
        }
        return grouped;
    }

    private List<FeedbackReply> repliesFor(InstructorFeedback feedback) {
        return new ArrayList<>(repliesByFeedback(List.of(feedback)).getOrDefault(feedback.getId(), List.of()));
    }

    private void syncLegacyAnswerProjection(InstructorFeedback feedback, List<FeedbackReply> replies) {
        FeedbackReply last = replies.stream().filter(reply -> reply.getPublishedAt() != null)
                .max(Comparator.comparing(FeedbackReply::getPublishedAt,
                        Comparator.nullsLast(Comparator.naturalOrder())))
                .orElse(null);
        if (last != null && last.getAuthorRole() == FeedbackReplyAuthorRole.STUDENT) {
            feedback.setAnswered(true);
            feedback.setAnswerContent(last.getContent());
            feedback.setAnsweredAt(last.getPublishedAt());
        } else {
            feedback.setAnswered(false);
            feedback.setAnswerContent(null);
            feedback.setAnsweredAt(null);
        }
    }

    private List<User> activeStudentMembers(Project project) {
        if (project.getProjectMembers() == null) return List.of();
        Map<UUID, User> users = new HashMap<>();
        for (ProjectMember member : project.getProjectMembers()) {
            User user = member.getUser();
            if (user != null && isStudentMember(user, project)) users.put(user.getId(), user);
        }
        return List.copyOf(users.values());
    }

    private boolean isStudentMember(User user, Project project) {
        if (user == null || user.getRole() != UserRole.STUDENT || user.getAccountStatus() != AccountStatus.ACTIVE
                || project == null || project.getProjectMembers() == null) return false;
        return project.getProjectMembers().stream().anyMatch(member -> member.getUser() != null
                && sameUser(member.getUser(), user)
                && (member.getRole() == ProjectRole.LEADER || member.getRole() == ProjectRole.MEMBER));
    }

    private boolean isCurrentAssignee(User user, PaperSection section, Project project) {
        return user != null && section != null && section.isActive() && section.getAssignedUser() != null
                && sameUser(section.getAssignedUser(), user) && isStudentMember(user, project);
    }

    private boolean isInstructorViewer(User user, FeedbackRequest request) {
        return isAdmin(user) || (isInstructor(user) && request.getInstructor() != null
                && sameUser(request.getInstructor(), user));
    }

    private boolean isAdmin(User user) {
        return user != null && (user.getRole() == UserRole.ADMIN || currentUserService.isAdmin(user));
    }

    private boolean isInstructor(User user) {
        return user != null && (user.getRole() == UserRole.INSTRUCTOR || currentUserService.isInstructor(user));
    }

    private static boolean hasSnapshot(FeedbackRequest request) {
        return request.getSubmissionSnapshotJson() != null && !request.getSubmissionSnapshotJson().isBlank();
    }

    private static boolean isPublished(InstructorFeedback feedback) {
        return feedback.getPublishedAt() != null;
    }

    private static FeedbackThreadState effectiveState(InstructorFeedback feedback) {
        return feedback.getPendingState() == null ? Objects.requireNonNullElse(feedback.getThreadState(), FeedbackThreadState.OPEN)
                : feedback.getPendingState();
    }

    private static boolean isInstructorReply(FeedbackReply reply) {
        return reply.getAuthorRole() == FeedbackReplyAuthorRole.INSTRUCTOR
                || reply.getAuthorRole() == FeedbackReplyAuthorRole.ADMIN;
    }

    private static FeedbackReplyAuthorRole roleOf(User user) {
        if (user == null || user.getRole() == null) return FeedbackReplyAuthorRole.UNKNOWN;
        return switch (user.getRole()) {
            case STUDENT -> FeedbackReplyAuthorRole.STUDENT;
            case INSTRUCTOR -> FeedbackReplyAuthorRole.INSTRUCTOR;
            case ADMIN -> FeedbackReplyAuthorRole.ADMIN;
        };
    }

    private static long revision(InstructorFeedback feedback) {
        return Objects.requireNonNullElse(feedback.getOptVersion(), 0L);
    }

    private static boolean sameUser(User left, User right) {
        return left != null && right != null && Objects.equals(left.getId(), right.getId());
    }

    private static UUID idOf(User user) {
        return user == null ? null : user.getId();
    }

    private static String displayName(User user) {
        if (user == null) return null;
        String name = (Objects.toString(user.getFirstName(), "") + " "
                + Objects.toString(user.getLastName(), "")).trim();
        return name.isEmpty() ? user.getEmail() : name;
    }

    private static FeedbackStatus parseStatus(String status) {
        try {
            FeedbackStatus parsed = FeedbackStatus.valueOf(status.toUpperCase());
            if (parsed == FeedbackStatus.PENDING) throw new IllegalArgumentException();
            return parsed;
        } catch (IllegalArgumentException | NullPointerException exception) {
            throw badRequest("Invalid status: " + status);
        }
    }

    private static boolean sameUuid(String candidate, UUID expected) {
        return expected != null && expected.toString().equals(candidate);
    }

    private static <T> List<T> nonNullList(List<T> values) {
        return values == null ? List.of() : values;
    }

    private static ResponseStatusException notFound(String type, UUID id) {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, type + " not found: " + id);
    }

    private static ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    private static ResponseStatusException forbidden(String message) {
        return new ResponseStatusException(HttpStatus.FORBIDDEN, message);
    }

    private static ResponseStatusException conflict(String message) {
        return new ResponseStatusException(HttpStatus.CONFLICT, message);
    }
}
