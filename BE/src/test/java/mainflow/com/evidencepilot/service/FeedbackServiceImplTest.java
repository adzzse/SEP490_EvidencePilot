package com.evidencepilot.service;

import com.evidencepilot.service.impl.CheckpointServiceImpl;
import com.evidencepilot.service.impl.CurrentUserServiceImpl;
import com.evidencepilot.dto.request.InstructorFeedbackRequest;
import com.evidencepilot.dto.request.FeedbackAnchorRequest;
import com.evidencepilot.dto.response.FeedbackRequestResponseDto;
import com.evidencepilot.dto.response.FeedbackRequestPageResponse;
import com.evidencepilot.dto.response.InstructorFeedbackResponseDto;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.FeedbackRequest;
import com.evidencepilot.model.FeedbackStatus;
import com.evidencepilot.model.InstructorFeedback;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.ProjectMember;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.AccountStatus;
import com.evidencepilot.model.enums.FeedbackThreadState;
import com.evidencepilot.model.enums.ProjectRole;
import com.evidencepilot.model.enums.ProjectStatus;
import com.evidencepilot.model.enums.UserRole;
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
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class FeedbackServiceImplTest {

    @Mock private FeedbackRequestRepository feedbackRequestRepository;
    @Mock private InstructorFeedbackRepository instructorFeedbackRepository;
    @Mock private com.evidencepilot.repository.ReviewSectionSnapshotRepository reviewSectionSnapshotRepository;
    @Mock private PaperSectionRepository paperSectionRepository;
    @Mock private ProjectRepository projectRepository;
    @Mock private CurrentUserServiceImpl currentUserService;
    @Mock private SystemNotificationService systemNotificationService;
    @Mock private CheckpointServiceImpl checkpointService;
    @Mock private ProjectCollectionService projectCollectionService;
    @Mock private SubmissionReadinessService submissionReadinessService;

    @Test
    void instructorQueueUsesScopedFiltersAndReturnsStablePageMetadata() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(instructor, student, ProjectStatus.SUBMITTED_FOR_REVIEW);
        FeedbackRequest item = request(project, instructor, student, FeedbackStatus.PENDING);
        LocalDate from = LocalDate.of(2026, 9, 1);
        LocalDate to = LocalDate.of(2026, 9, 21);
        var pageable = PageRequest.of(1, 20);
        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(feedbackRequestRepository.findCurrent(
                eq(instructor.getId()), eq(project.getId()), eq(FeedbackStatus.PENDING),
                any(), any(), eq("capstone"), eq(pageable)))
                .thenReturn(new PageImpl<>(List.of(item), pageable, 21));

        FeedbackRequestPageResponse response = service().findQueueForCurrentUser(
                1, 20, project.getId(), FeedbackStatus.PENDING, from, to, "capstone");

        assertThat(response.content()).hasSize(1);
        assertThat(response.page()).isEqualTo(1);
        assertThat(response.size()).isEqualTo(20);
        assertThat(response.totalElements()).isEqualTo(21);
        assertThat(response.totalPages()).isEqualTo(2);
        verify(feedbackRequestRepository).findCurrent(
                eq(instructor.getId()), eq(project.getId()), eq(FeedbackStatus.PENDING),
                any(), any(), eq("capstone"), eq(pageable));
    }

    @Test
    void adminQueueUsesTheSameCurrentQueryWithoutInstructorScope() {
        User admin = user(UserRole.ADMIN);
        var pageable = PageRequest.of(0, 10);
        when(currentUserService.requireCurrentUser()).thenReturn(admin);
        when(feedbackRequestRepository.findCurrent(
                isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), eq(pageable)))
                .thenReturn(Page.empty(pageable));

        FeedbackRequestPageResponse response = service().findQueueForCurrentUser(
                0, 10, null, null, null, null, null);

        assertThat(response.content()).isEmpty();
        verify(feedbackRequestRepository).findCurrent(
                isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), eq(pageable));
    }

    @Test
    void commentCreatesAnUnpublishedDraftWithoutNotifyingStudents() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(instructor, student, ProjectStatus.SUBMITTED_FOR_REVIEW);
        FeedbackRequest request = request(project, instructor, student, FeedbackStatus.PENDING);
        PaperSection section = section(project, student);
        request.setSubmissionSnapshotJson(new ObjectMapper().valueToTree(Map.of(
                "schemaVersion", 1, "projectId", project.getId(), "papers", List.of(Map.of(
                        "id", section.getDocument().getId(), "title", "Paper", "sections", List.of(Map.of(
                                "id", section.getId(), "contentTex", section.getContentTex(),
                                "title", section.getSectionTitle(), "order", 0,
                                "contentVersion", section.getVersion())))))).toString());

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
    void commentCannotUseLiveSectionWhenTheSubmissionSnapshotIsMissing() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(instructor, student, ProjectStatus.SUBMITTED_FOR_REVIEW);
        FeedbackRequest request = request(project, instructor, student, FeedbackStatus.PENDING);
        PaperSection section = section(project, student);
        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(feedbackRequestRepository.findByIdForUpdate(request.getId())).thenReturn(Optional.of(request));
        org.mockito.Mockito.lenient().when(paperSectionRepository.findById(section.getId()))
                .thenReturn(Optional.of(section));

        assertThatThrownBy(() -> service().comment(request.getId(),
                new InstructorFeedbackRequest(section.getId(), null, "A legacy draft")))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        error -> assertThat(error.getStatusCode().value()).isEqualTo(409));
        verify(instructorFeedbackRepository, never()).save(any(InstructorFeedback.class));
    }

    @Test
    void corruptOrForeignSnapshotCannotAcceptRootFeedback() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(instructor, student, ProjectStatus.SUBMITTED_FOR_REVIEW);
        FeedbackRequest request = request(project, instructor, student, FeedbackStatus.PENDING);
        PaperSection section = section(project, student);
        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(feedbackRequestRepository.findByIdForUpdate(request.getId())).thenReturn(Optional.of(request));
        org.mockito.Mockito.lenient().when(paperSectionRepository.findById(section.getId())).thenReturn(Optional.of(section));
        for (String invalid : List.of("null", "{}", "{bad", "{\"schemaVersion\":1,\"projectId\":\"wrong\",\"papers\":[]}")) {
            request.setSubmissionSnapshotJson(invalid);
            assertThatThrownBy(() -> service().comment(request.getId(), new InstructorFeedbackRequest(section.getId(), null, "Draft")))
                    .isInstanceOfSatisfying(ResponseStatusException.class, error -> assertThat(error.getStatusCode().value()).isEqualTo(409));
        }
        verify(instructorFeedbackRepository, never()).save(any(InstructorFeedback.class));
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

        assertThat(service().getFeedbackItems(request.getId(), null)).isEmpty();
    }

    @Test
    void publishedRootCannotBeEditedOrDeleted() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(instructor, student, ProjectStatus.RETURNED);
        FeedbackRequest request = request(project, instructor, student, FeedbackStatus.RETURNED);
        PaperSection section = section(project, student);
        InstructorFeedback root = feedback(request, section, instructor, true);

        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(instructorFeedbackRepository.findById(root.getId())).thenReturn(Optional.of(root));
        assertThatThrownBy(() -> service().updateFeedbackItem(root.getId(),
                new InstructorFeedbackRequest(section.getId(), null, "Replacement text.")))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Published feedback is immutable");

        assertThatThrownBy(() -> service().deleteFeedbackItem(root.getId()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Published feedback is immutable");
        verify(instructorFeedbackRepository, never()).delete(any());
        verifyNoInteractions(systemNotificationService);
    }

    @Test
    void draftUpdateReplacesPassageWithSameId() throws Exception {
        Fixture f = draftFixture();
        FeedbackAnchorRequest replacement = new FeedbackAnchorRequest(
                9, 17, f.section.getVersion(), sha256("Evidence sentence."),
                "latex-source-lf-v1", "utf16");

        InstructorFeedbackResponseDto view = service().updateFeedbackItem(f.root.getId(),
                new InstructorFeedbackRequest(f.section.getId(), null, "Sharpen this.", replacement));

        assertThat(view.content()).isEqualTo("Sharpen this.");
        assertThat(view.anchor().original().from()).isEqualTo(9);
        assertThat(view.anchor().original().to()).isEqualTo(17);
        assertThat(view.anchor().original().exact()).isEqualTo("sentence");
        verify(instructorFeedbackRepository).saveAndFlush(f.root);
    }

    @Test
    void draftTextOnlyUpdateKeepsStoredPassage() throws Exception {
        Fixture f = draftFixture();
        when(instructorFeedbackRepository.findById(f.root.getId())).thenReturn(Optional.of(f.root));

        InstructorFeedbackResponseDto view = service().updateFeedbackItem(f.root.getId(),
                new InstructorFeedbackRequest(f.section.getId(), null, "Reworded only.",
                        new FeedbackAnchorRequest(0, 8, f.section.getVersion(),
                                sha256("Evidence sentence."), "latex-source-lf-v1", "utf16")));

        assertThat(view.content()).isEqualTo("Reworded only.");
        assertThat(view.anchor().original().from()).isEqualTo(0);
        assertThat(view.anchor().original().to()).isEqualTo(8);
    }

    @Test
    void draftUpdateWithStaleAnchorFailsWithoutPersisting() {
        Fixture f = draftFixture();
        when(instructorFeedbackRepository.findById(f.root.getId())).thenReturn(Optional.of(f.root));

        assertThatThrownBy(() -> service().updateFeedbackItem(f.root.getId(),
                new InstructorFeedbackRequest(f.section.getId(), null, "Half update.",
                        new FeedbackAnchorRequest(0, 8, 999, "0".repeat(64),
                                "latex-source-lf-v1", "utf16"))))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("does not match");
        verify(instructorFeedbackRepository, never()).saveAndFlush(any());
    }

    private record Fixture(PaperSection section, InstructorFeedback root) {
    }

    private Fixture draftFixture() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(instructor, student, ProjectStatus.SUBMITTED_FOR_REVIEW);
        FeedbackRequest request = request(project, instructor, student, FeedbackStatus.PENDING);
        PaperSection section = section(project, student);
        InstructorFeedback root = feedback(request, section, instructor, false);
        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(instructorFeedbackRepository.findById(root.getId())).thenReturn(Optional.of(root));
        return new Fixture(section, root);
    }

    @Test
    void studentCanReadPublishedFeedbackButCannotCreateEditOrDeleteIt() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(instructor, student, ProjectStatus.RETURNED);
        FeedbackRequest request = request(project, instructor, student, FeedbackStatus.RETURNED);
        PaperSection section = section(project, student);
        InstructorFeedback root = feedback(request, section, instructor, true);
        when(currentUserService.requireCurrentUser()).thenReturn(student);
        when(feedbackRequestRepository.findById(request.getId())).thenReturn(Optional.of(request));
        when(feedbackRequestRepository.findByIdForUpdate(request.getId())).thenReturn(Optional.of(request));
        when(instructorFeedbackRepository.findByRequestId(request.getId())).thenReturn(List.of(root));
        when(instructorFeedbackRepository.findById(root.getId())).thenReturn(Optional.of(root));

        var view = service().getFeedbackItems(request.getId(), null).getFirst();
        assertThat(view.content()).isEqualTo("Original feedback.");
        assertThat(view.canEdit() || view.canDelete()).isFalse();
        InstructorFeedbackRequest input = new InstructorFeedbackRequest(section.getId(), null, "Student text");
        assertThatThrownBy(() -> service().comment(request.getId(), input))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("403");
        assertThatThrownBy(() -> service().updateFeedbackItem(root.getId(), input))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("403");
        assertThatThrownBy(() -> service().deleteFeedbackItem(root.getId()))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("403");
        verify(instructorFeedbackRepository, never()).save(any());
        verify(instructorFeedbackRepository, never()).saveAndFlush(any());
        verify(instructorFeedbackRepository, never()).delete(any());
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

        service().updateStatus(request.getId(), "RETURNED");

        assertThat(request.getStatus()).isEqualTo(FeedbackStatus.RETURNED);
        assertThat(request.getReturnedAt()).isNotNull();
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
    void returnedRequestCannotBeApprovedWithoutAFreshSubmission() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(instructor, student, ProjectStatus.RETURNED);
        FeedbackRequest request = request(project, instructor, student, FeedbackStatus.RETURNED);

        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(feedbackRequestRepository.findByIdForUpdate(request.getId())).thenReturn(Optional.of(request));
        when(projectRepository.findByIdForUpdate(project.getId())).thenReturn(Optional.of(project));
        when(feedbackRequestRepository.findByProjectIdOrderByRequestedAtDesc(project.getId())).thenReturn(List.of(request));

        assertThatThrownBy(() -> service().updateStatus(request.getId(), "REVIEWED"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Approve requires the latest submitted review request");
        assertThat(request.getStatus()).isEqualTo(FeedbackStatus.RETURNED);
        assertThat(project.getStatus()).isEqualTo(ProjectStatus.RETURNED);
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

        assertThatThrownBy(() -> service().updateStatus(request.getId(), "REVIEWED"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Publish or delete instructor drafts before approving");
        verifyNoInteractions(systemNotificationService);
    }

    @Test
    void rejectTransitionIsRetired() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(instructor, student, ProjectStatus.SUBMITTED_FOR_REVIEW);
        FeedbackRequest request = request(project, instructor, student, FeedbackStatus.PENDING);

        when(currentUserService.requireCurrentUser()).thenReturn(instructor);

        assertThatThrownBy(() -> service().updateStatus(request.getId(), "REJECTED"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("409");
        assertThat(request.getStatus()).isEqualTo(FeedbackStatus.PENDING);
    }

    @Test
    void feedbackRequestResponseIncludesTransitionTimestamps() {
        assertThat(Arrays.stream(FeedbackRequestResponseDto.class.getRecordComponents())
                .map(component -> component.getName())
                .toList())
                .contains("returnedAt", "reviewedAt");
    }

    @Test
    void approveSucceedsWithOpenThreadsAndNoClosure() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(instructor, student, ProjectStatus.SUBMITTED_FOR_REVIEW);
        FeedbackRequest request = request(project, instructor, student, FeedbackStatus.PENDING);
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
        when(submissionReadinessService.assess(project, instructor)).thenReturn(
                new SubmissionReadinessService.Assessment(null, List.of(paper), Map.of(paper.getId(), List.of(section))));

        section.setContentTex("Changed after Return.");
        assertThatThrownBy(() -> service().updateStatus(request.getId(), "REVIEWED"))
                .hasMessageContaining("no longer matches current section content");
        section.setContentTex("Evidence sentence.");
        service().updateStatus(request.getId(), "REVIEWED");
        assertThat(project.getStatus()).isEqualTo(ProjectStatus.APPROVED);
        assertThat(request.getStatus()).isEqualTo(com.evidencepilot.model.FeedbackStatus.REVIEWED);
        assertThat(request.getReviewedAt()).isNotNull();
        assertThat(root.getThreadState()).isEqualTo(FeedbackThreadState.OPEN);
        assertThat(root.getPendingState()).isNull();
    }

    private static String sha256(String text) throws Exception {
        var digest = java.security.MessageDigest.getInstance("SHA-256");
        byte[] hash = digest.digest(text.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        StringBuilder hex = new StringBuilder();
        for (byte b : hash) hex.append(String.format("%02x", b));
        return hex.toString();
    }

    @Test
    void memberListSeesOnlyOwnAssignedSections() {
        Team team = team();
        PaperSection secA = section(team.project, team.memberA);
        PaperSection secB = section(team.project, team.memberB);
        InstructorFeedback fbA = feedback(team.request, secA, team.instructor, true);
        InstructorFeedback fbB = feedback(team.request, secB, team.instructor, true);
        InstructorFeedback draft = feedback(team.request, secA, team.instructor, false);

        when(currentUserService.requireCurrentUser()).thenReturn(team.memberA);
        when(feedbackRequestRepository.findById(team.request.getId())).thenReturn(Optional.of(team.request));
        when(instructorFeedbackRepository.findByRequestId(team.request.getId()))
                .thenReturn(List.of(fbA, fbB, draft));

        assertThat(service().getFeedbackItems(team.request.getId(), null))
                .extracting(InstructorFeedbackResponseDto::id).containsExactly(fbA.getId());
    }

    @Test
    void memberExplicitForeignSectionIsForbidden() {
        Team team = team();
        PaperSection secB = section(team.project, team.memberB);

        when(currentUserService.requireCurrentUser()).thenReturn(team.memberA);
        when(feedbackRequestRepository.findById(team.request.getId())).thenReturn(Optional.of(team.request));
        when(paperSectionRepository.findById(secB.getId())).thenReturn(Optional.of(secB));

        assertThatThrownBy(() -> service().getFeedbackItems(team.request.getId(), secB.getId()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("403");
    }

    @Test
    void memberThreadOnForeignSectionIsHidden() {
        Team team = team();
        PaperSection secB = section(team.project, team.memberB);
        InstructorFeedback fbB = feedback(team.request, secB, team.instructor, true);
        InstructorFeedback fbA = feedback(team.request, section(team.project, team.memberA), team.instructor, true);

        when(currentUserService.requireCurrentUser()).thenReturn(team.memberA);
        when(instructorFeedbackRepository.findById(fbB.getId())).thenReturn(Optional.of(fbB));
        when(instructorFeedbackRepository.findById(fbA.getId())).thenReturn(Optional.of(fbA));

        assertThatThrownBy(() -> service().getThread(fbB.getId()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("404");
        assertThat(service().getThread(fbA.getId()).id()).isEqualTo(fbA.getId());
    }

    @Test
    void leaderSeesWholeRequestUnfiltered() {
        Team team = team();
        PaperSection secA = section(team.project, team.memberA);
        PaperSection secB = section(team.project, team.memberB);
        InstructorFeedback fbA = feedback(team.request, secA, team.instructor, true);
        InstructorFeedback fbB = feedback(team.request, secB, team.instructor, true);

        when(currentUserService.requireCurrentUser()).thenReturn(team.leader);
        when(feedbackRequestRepository.findById(team.request.getId())).thenReturn(Optional.of(team.request));
        when(instructorFeedbackRepository.findByRequestId(team.request.getId()))
                .thenReturn(List.of(fbA, fbB));

        assertThat(service().getFeedbackItems(team.request.getId(), null))
                .extracting(InstructorFeedbackResponseDto::id)
                .containsExactly(fbA.getId(), fbB.getId());
        assertThat(service().getFeedbackItems(team.request.getId(), secB.getId()))
                .extracting(InstructorFeedbackResponseDto::id).containsExactly(fbB.getId());
    }

    private record Team(User instructor, User leader, User memberA, User memberB,
                        Project project, FeedbackRequest request) {
    }

    private Team team() {
        User instructor = user(UserRole.INSTRUCTOR);
        User leader = user(UserRole.STUDENT);
        User memberA = user(UserRole.STUDENT);
        User memberB = user(UserRole.STUDENT);
        Project project = project(instructor, leader, ProjectStatus.SUBMITTED_FOR_REVIEW);
        project.setProjectMembers(List.of(
                member(project, instructor, ProjectRole.INSTRUCTOR),
                member(project, leader, ProjectRole.LEADER),
                member(project, memberA, ProjectRole.MEMBER),
                member(project, memberB, ProjectRole.MEMBER)));
        FeedbackRequest request = request(project, instructor, leader, FeedbackStatus.PENDING);
        return new Team(instructor, leader, memberA, memberB, project, request);
    }

    private ProjectMember member(Project project, User user, ProjectRole role) {
        ProjectMember membership = new ProjectMember();
        membership.setProject(project);
        membership.setUser(user);
        membership.setRole(role);
        return membership;
    }

    private FeedbackServiceImpl service() {
        ObjectMapper mapper = new ObjectMapper();
        return new FeedbackServiceImpl(
                feedbackRequestRepository,
                instructorFeedbackRepository,
                reviewSectionSnapshotRepository,
                paperSectionRepository,
                projectRepository,
                currentUserService,
                systemNotificationService,
                checkpointService,
                projectCollectionService,
                submissionReadinessService,
                mapper,
                org.mockito.Mockito.mock(com.evidencepilot.repository.AssignmentSectionBaselineRepository.class),
                new FeedbackAnchorService(instructorFeedbackRepository, mapper),
                org.mockito.Mockito.mock(com.evidencepilot.service.FeedbackAttachmentService.class));
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

