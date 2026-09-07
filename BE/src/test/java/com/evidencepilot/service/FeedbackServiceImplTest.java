package com.evidencepilot.service;

import com.evidencepilot.dto.request.FeedbackReplyRequest;
import com.evidencepilot.dto.request.FeedbackStateRequest;
import com.evidencepilot.dto.request.InstructorFeedbackRequest;
import com.evidencepilot.dto.response.InstructorFeedbackResponseDto;
import com.evidencepilot.model.Document;
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
import com.evidencepilot.service.impl.FeedbackServiceImpl;
import com.evidencepilot.service.impl.ProjectCollectionService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class FeedbackServiceImplTest {

    @Mock private FeedbackRequestRepository feedbackRequestRepository;
    @Mock private InstructorFeedbackRepository instructorFeedbackRepository;
    @Mock private FeedbackReplyRepository feedbackReplyRepository;
    @Mock private PaperSectionRepository paperSectionRepository;
    @Mock private ProjectRepository projectRepository;
    @Mock private CurrentUserService currentUserService;
    @Mock private SystemNotificationService systemNotificationService;
    @Mock private CheckpointService checkpointService;
    @Mock private ProjectCollectionService projectCollectionService;
    @Mock private SubmissionReadinessService submissionReadinessService;

    @Test
    void commentCreatesAnUnpublishedDraftWithoutNotifyingStudents() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(instructor, student, ProjectStatus.SUBMITTED_FOR_REVIEW);
        FeedbackRequest request = request(project, instructor, student, FeedbackStatus.PENDING);
        PaperSection section = section(project, student);

        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(feedbackRequestRepository.findByIdForUpdate(request.getId())).thenReturn(Optional.of(request));
        when(paperSectionRepository.findById(section.getId())).thenReturn(Optional.of(section));
        when(instructorFeedbackRepository.save(any(InstructorFeedback.class))).thenAnswer(invocation -> {
            InstructorFeedback feedback = invocation.getArgument(0);
            feedback.setId(UUID.randomUUID());
            return feedback;
        });

        InstructorFeedbackResponseDto response = service().comment(request.getId(),
                new InstructorFeedbackRequest(section.getId(), null, "Clarify this evidence."));

        ArgumentCaptor<InstructorFeedback> saved = ArgumentCaptor.forClass(InstructorFeedback.class);
        verify(instructorFeedbackRepository).save(saved.capture());
        assertThat(saved.getValue().getPublishedAt()).isNull();
        assertThat(response.publishedAt()).isNull();
        verifyNoInteractions(systemNotificationService);
    }

    @Test
    void studentListNeverExposesAnUnpublishedRoot() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(instructor, student, ProjectStatus.SUBMITTED_FOR_REVIEW);
        FeedbackRequest request = request(project, instructor, student, FeedbackStatus.PENDING);
        InstructorFeedback root = feedback(request, section(project, student), instructor, false);

        when(currentUserService.requireCurrentUser()).thenReturn(student);
        when(feedbackRequestRepository.findById(request.getId())).thenReturn(Optional.of(request));
        when(instructorFeedbackRepository.findByRequestId(request.getId())).thenReturn(List.of(root));

        assertThat(service().getFeedbackItems(request.getId())).isEmpty();
        verifyNoInteractions(feedbackReplyRepository);
    }

    @Test
    void studentReplyIsPublishedOnceAndNeverCreatesConversationNotifications() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(instructor, student, ProjectStatus.RETURNED);
        FeedbackRequest request = request(project, instructor, student, FeedbackStatus.RETURNED);
        PaperSection section = section(project, student);
        InstructorFeedback root = feedback(request, section, instructor, true);
        UUID key = UUID.randomUUID();
        List<FeedbackReply> replies = new ArrayList<>();

        when(currentUserService.requireCurrentUser()).thenReturn(student);
        when(instructorFeedbackRepository.findByIdForUpdate(root.getId())).thenReturn(Optional.of(root));
        when(feedbackReplyRepository.findByFeedbackIdAndIdempotencyKey(root.getId(), key))
                .thenReturn(Optional.empty())
                .thenAnswer(invocation -> Optional.of(replies.getFirst()));
        when(feedbackReplyRepository.findByFeedbackIdInOrderByCreatedAtAsc(anyCollection()))
                .thenAnswer(invocation -> List.copyOf(replies));
        doAnswer(invocation -> {
            FeedbackReply reply = invocation.getArgument(0);
            reply.setId(UUID.randomUUID());
            replies.add(reply);
            return reply;
        }).when(feedbackReplyRepository).save(any(FeedbackReply.class));

        service().answerFeedback(root.getId(), "I fixed the cited passage.", key);
        service().answerFeedback(root.getId(), "I fixed the cited passage.", key);

        assertThat(replies).hasSize(1);
        assertThat(replies.getFirst().getPublishedAt()).isNotNull();
        assertThat(root.isAnswered()).isTrue();
        verify(feedbackReplyRepository).save(any(FeedbackReply.class));
        verifyNoInteractions(systemNotificationService);
    }

    @Test
    void publishedRootIsImmutableButInstructorCanSaveAnUnpublishedReplyDraft() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(instructor, student, ProjectStatus.RETURNED);
        FeedbackRequest request = request(project, instructor, student, FeedbackStatus.RETURNED);
        PaperSection section = section(project, student);
        InstructorFeedback root = feedback(request, section, instructor, true);
        UUID key = UUID.randomUUID();

        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(instructorFeedbackRepository.findById(root.getId())).thenReturn(Optional.of(root));
        assertThatThrownBy(() -> service().updateFeedbackItem(root.getId(),
                new InstructorFeedbackRequest(section.getId(), null, "Replacement text.")))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Published feedback is immutable");

        when(instructorFeedbackRepository.findByIdForUpdate(root.getId())).thenReturn(Optional.of(root));
        when(feedbackReplyRepository.findByFeedbackIdAndIdempotencyKey(root.getId(), key)).thenReturn(Optional.empty());
        when(feedbackReplyRepository.findByFeedbackIdInOrderByCreatedAtAsc(anyCollection())).thenReturn(List.of());
        when(feedbackReplyRepository.save(any(FeedbackReply.class))).thenAnswer(invocation -> {
            FeedbackReply reply = invocation.getArgument(0);
            reply.setId(UUID.randomUUID());
            return reply;
        });

        service().createInstructorReply(root.getId(), new FeedbackReplyRequest("Please verify the revision.", key));

        ArgumentCaptor<FeedbackReply> saved = ArgumentCaptor.forClass(FeedbackReply.class);
        verify(feedbackReplyRepository).save(saved.capture());
        assertThat(saved.getValue().getPublishedAt()).isNull();
        assertThat(saved.getValue().getAuthorRole()).isEqualTo(FeedbackReplyAuthorRole.INSTRUCTOR);
        verifyNoInteractions(systemNotificationService);
    }

    @Test
    void doneFeedbackRejectsNewInstructorReplyDraftsUntilItIsReopened() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(instructor, student, ProjectStatus.RETURNED);
        FeedbackRequest request = request(project, instructor, student, FeedbackStatus.RETURNED);
        InstructorFeedback root = feedback(request, section(project, student), instructor, true);
        root.setThreadState(FeedbackThreadState.DONE);

        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(instructorFeedbackRepository.findByIdForUpdate(root.getId())).thenReturn(Optional.of(root));

        assertThatThrownBy(() -> service().createInstructorReply(root.getId(),
                new FeedbackReplyRequest("Please revisit this.", UUID.randomUUID())))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("thread must be open");
        verifyNoInteractions(feedbackReplyRepository);
    }

    @Test
    void pendingDoneStateIsVisibleToInstructorOnlyUntilReturn() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(instructor, student, ProjectStatus.RETURNED);
        FeedbackRequest request = request(project, instructor, student, FeedbackStatus.RETURNED);
        InstructorFeedback root = feedback(request, section(project, student), instructor, true);
        root.setOptVersion(0L);

        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(instructorFeedbackRepository.findByIdForUpdate(root.getId())).thenReturn(Optional.of(root));
        when(instructorFeedbackRepository.saveAndFlush(root)).thenAnswer(invocation -> {
            root.setOptVersion(1L);
            return root;
        });
        when(feedbackReplyRepository.findByFeedbackIdInOrderByCreatedAtAsc(anyCollection())).thenReturn(List.of());

        InstructorFeedbackResponseDto instructorView = service().prepareFeedbackState(root.getId(),
                new FeedbackStateRequest(FeedbackThreadState.DONE, 0L));

        assertThat(root.getThreadState()).isEqualTo(FeedbackThreadState.OPEN);
        assertThat(instructorView.pendingState()).isEqualTo(FeedbackThreadState.DONE);
        assertThat(instructorView.canReopen()).isTrue();
        assertThat(instructorView.canMarkDone()).isFalse();

        when(currentUserService.requireCurrentUser()).thenReturn(student);
        when(feedbackRequestRepository.findById(request.getId())).thenReturn(Optional.of(request));
        when(instructorFeedbackRepository.findByRequestId(request.getId())).thenReturn(List.of(root));

        InstructorFeedbackResponseDto studentView = service().getFeedbackItems(request.getId()).getFirst();
        assertThat(studentView.threadState()).isEqualTo(FeedbackThreadState.OPEN);
        assertThat(studentView.pendingState()).isNull();
        verifyNoInteractions(systemNotificationService);
    }

    @Test
    void returnPublishesCurrentRootAndNotifiesTheGroupAndCurrentAssignee() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(instructor, student, ProjectStatus.SUBMITTED_FOR_REVIEW);
        FeedbackRequest request = request(project, instructor, student, FeedbackStatus.PENDING);
        PaperSection section = section(project, student);
        InstructorFeedback root = feedback(request, section, instructor, false);

        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(feedbackRequestRepository.findByIdForUpdate(request.getId())).thenReturn(Optional.of(request));
        when(projectRepository.findByIdForUpdate(project.getId())).thenReturn(Optional.of(project));
        when(feedbackRequestRepository.findByProjectIdOrderByRequestedAtDesc(project.getId())).thenReturn(List.of(request));
        when(instructorFeedbackRepository.findByRequestProjectIdForUpdate(project.getId())).thenReturn(List.of(root));
        when(feedbackReplyRepository.findByFeedbackIdInForUpdate(anyCollection())).thenReturn(List.of());

        service().updateStatus(request.getId(), "RETURNED");

        assertThat(request.getStatus()).isEqualTo(FeedbackStatus.RETURNED);
        assertThat(project.getStatus()).isEqualTo(ProjectStatus.RETURNED);
        assertThat(root.getPublishedAt()).isNotNull();
        verify(systemNotificationService).createNotification(
                eq(student), eq(instructor), eq("REVIEW_RETURNED"), eq(request.getId()), any(String.class));
        verify(systemNotificationService).createNotification(
                eq(student), eq(instructor), eq("INSTRUCTOR_FEEDBACK_PUBLISHED"), eq(request.getId()),
                eq(root.getId()), any(String.class));
    }

    @Test
    void returnedRequestCannotBeReturnedAgainToPublishDraftsTwice() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(instructor, student, ProjectStatus.RETURNED);
        FeedbackRequest request = request(project, instructor, student, FeedbackStatus.RETURNED);

        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(feedbackRequestRepository.findByIdForUpdate(request.getId())).thenReturn(Optional.of(request));
        when(projectRepository.findByIdForUpdate(project.getId())).thenReturn(Optional.of(project));
        when(feedbackRequestRepository.findByProjectIdOrderByRequestedAtDesc(project.getId())).thenReturn(List.of(request));

        assertThatThrownBy(() -> service().updateStatus(request.getId(), "RETURNED"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Only a PENDING review request can be returned");
        verifyNoInteractions(systemNotificationService);
    }

    @Test
    void approveRejectsProjectWhenAnyInstructorTextIsStillDraft() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(instructor, student, ProjectStatus.SUBMITTED_FOR_REVIEW);
        FeedbackRequest request = request(project, instructor, student, FeedbackStatus.PENDING);
        InstructorFeedback draftRoot = feedback(request, section(project, student), instructor, false);

        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(feedbackRequestRepository.findByIdForUpdate(request.getId())).thenReturn(Optional.of(request));
        when(projectRepository.findByIdForUpdate(project.getId())).thenReturn(Optional.of(project));
        when(feedbackRequestRepository.findByProjectIdOrderByRequestedAtDesc(project.getId())).thenReturn(List.of(request));
        when(instructorFeedbackRepository.findByRequestProjectIdForUpdate(project.getId())).thenReturn(List.of(draftRoot));
        when(feedbackReplyRepository.findByFeedbackIdInForUpdate(anyCollection())).thenReturn(List.of());

        assertThatThrownBy(() -> service().updateStatus(request.getId(), "REVIEWED"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Publish or delete instructor drafts before approving");
        verifyNoInteractions(systemNotificationService);
    }

    @Test
    void returnedReviewCanBeApprovedOnlyWithUnchangedSnapshotAndDoneThreads() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(instructor, student, ProjectStatus.RETURNED);
        FeedbackRequest request = request(project, instructor, student, FeedbackStatus.RETURNED);
        PaperSection section = section(project, student);
        Document paper = section.getDocument();
        paper.setTitle("Paper");
        paper.setProcessingStatus(com.evidencepilot.model.enums.ProcessingStatus.READY);
        InstructorFeedback root = feedback(request, section, instructor, true);
        request.setSubmissionSnapshotJson(new ObjectMapper().valueToTree(Map.of(
                "projectId", project.getId(), "papers", List.of(Map.of(
                        "id", paper.getId(), "title", paper.getTitle(), "processingStatus", "READY",
                        "sections", List.of(Map.of("id", section.getId(), "title", section.getSectionTitle(),
                                "order", section.getSectionOrder(), "contentTex", section.getContentTex(),
                                "contentVersion", section.getVersion(), "assignedUserId", student.getId())))))).toString());
        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(feedbackRequestRepository.findByIdForUpdate(request.getId())).thenReturn(Optional.of(request));
        when(projectRepository.findByIdForUpdate(project.getId())).thenReturn(Optional.of(project));
        when(feedbackRequestRepository.findByProjectIdOrderByRequestedAtDesc(project.getId())).thenReturn(List.of(request));
        when(instructorFeedbackRepository.findByRequestProjectIdForUpdate(project.getId())).thenReturn(List.of(root));
        when(feedbackReplyRepository.findByFeedbackIdInForUpdate(anyCollection())).thenReturn(List.of());
        when(submissionReadinessService.assess(project, instructor)).thenReturn(
                new SubmissionReadinessService.Assessment(null, List.of(paper), Map.of(paper.getId(), List.of(section))));

        section.setContentTex("Changed after Return.");
        assertThatThrownBy(() -> service().updateStatus(request.getId(), "REVIEWED"))
                .hasMessageContaining("no longer matches current section content");
        section.setContentTex("Evidence sentence.");
        assertThatThrownBy(() -> service().updateStatus(request.getId(), "REVIEWED"))
                .hasMessageContaining("Every feedback thread must be done");
        root.setPendingState(FeedbackThreadState.DONE);
        root.setPendingStateOptVersion(root.getOptVersion());
        service().updateStatus(request.getId(), "REVIEWED");
        assertThat(project.getStatus()).isEqualTo(ProjectStatus.APPROVED);
        assertThat(root.getThreadState()).isEqualTo(FeedbackThreadState.DONE);
        assertThat(root.getPendingState()).isNull();
    }

    private FeedbackServiceImpl service() {
        ObjectMapper mapper = new ObjectMapper();
        return new FeedbackServiceImpl(
                feedbackRequestRepository,
                instructorFeedbackRepository,
                feedbackReplyRepository,
                paperSectionRepository,
                projectRepository,
                currentUserService,
                systemNotificationService,
                checkpointService,
                projectCollectionService,
                submissionReadinessService,
                mapper,
                new FeedbackAnchorService(instructorFeedbackRepository, mapper));
    }

    private User user(UserRole role) {
        User user = new User();
        user.setId(UUID.randomUUID());
        user.setEmail(user.getId() + "@example.test");
        user.setRole(role);
        user.setAccountStatus(AccountStatus.ACTIVE);
        return user;
    }

    private Project project(User instructor, User student, ProjectStatus status) {
        Project project = new Project();
        project.setId(UUID.randomUUID());
        project.setTitle("Capstone");
        project.setActive(true);
        project.setStatus(status);

        ProjectMember instructorMember = new ProjectMember();
        instructorMember.setProject(project);
        instructorMember.setUser(instructor);
        instructorMember.setRole(ProjectRole.INSTRUCTOR);

        ProjectMember studentMember = new ProjectMember();
        studentMember.setProject(project);
        studentMember.setUser(student);
        studentMember.setRole(ProjectRole.MEMBER);
        project.setProjectMembers(List.of(instructorMember, studentMember));
        return project;
    }

    private FeedbackRequest request(Project project, User instructor, User student, FeedbackStatus status) {
        FeedbackRequest request = new FeedbackRequest();
        request.setId(UUID.randomUUID());
        request.setProject(project);
        request.setInstructor(instructor);
        request.setStudent(student);
        request.setStatus(status);
        request.setRequestedAt(LocalDateTime.now());
        request.setUpdatedAt(LocalDateTime.now());
        return request;
    }

    private PaperSection section(Project project, User assignee) {
        Document document = new Document();
        document.setId(UUID.randomUUID());
        document.setProject(project);

        PaperSection section = new PaperSection();
        section.setId(UUID.randomUUID());
        section.setDocument(document);
        section.setAssignedUser(assignee);
        section.setSectionTitle("Introduction");
        section.setSectionOrder(1);
        section.setContentTex("Evidence sentence.");
        section.setVersion(1);
        section.setActive(true);
        return section;
    }

    private InstructorFeedback feedback(FeedbackRequest request, PaperSection section, User instructor, boolean published) {
        InstructorFeedback feedback = new InstructorFeedback();
        feedback.setId(UUID.randomUUID());
        feedback.setRequest(request);
        feedback.setSection(section);
        feedback.setInstructor(instructor);
        feedback.setContent("Original feedback.");
        feedback.setCreatedAt(LocalDateTime.now());
        feedback.setUpdatedAt(LocalDateTime.now());
        feedback.setUpdatedBy(instructor);
        feedback.setSectionVersion(section.getVersion());
        feedback.setThreadState(FeedbackThreadState.OPEN);
        feedback.setOptVersion(0L);
        if (published) feedback.setPublishedAt(LocalDateTime.now());
        return feedback;
    }
}
