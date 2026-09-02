package com.evidencepilot.service;

import com.evidencepilot.dto.response.FeedbackRequestResponseDto;
import com.evidencepilot.model.FeedbackRequest;
import com.evidencepilot.dto.request.InstructorFeedbackRequest;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.InstructorFeedback;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.ProjectMember;
import com.evidencepilot.model.SectionStandardEvaluation;
import com.evidencepilot.model.User;
import com.evidencepilot.model.FeedbackStatus;
import com.evidencepilot.model.enums.ProjectRole;
import com.evidencepilot.model.enums.ProjectStatus;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.FeedbackRequestRepository;
import com.evidencepilot.repository.InstructorFeedbackRepository;
import com.evidencepilot.repository.PaperSectionRepository;
import com.evidencepilot.repository.ProjectRepository;
import com.evidencepilot.repository.SectionStandardEvaluationRepository;
import com.evidencepilot.service.impl.FeedbackServiceImpl;
import com.evidencepilot.service.impl.ProjectCollectionService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.doThrow;

@ExtendWith(MockitoExtension.class)
class FeedbackServiceImplTest {

    @Mock
    private FeedbackRequestRepository feedbackRequestRepository;

    @Mock
    private InstructorFeedbackRepository instructorFeedbackRepository;

    @Mock
    private PaperSectionRepository paperSectionRepository;

    @Mock
    private DocumentRepository documentRepository;

    @Mock
    private ProjectRepository projectRepository;

    @Mock
    private CurrentUserService currentUserService;

    @Mock
    private SystemNotificationService systemNotificationService;

    @Mock
    private PaperProcessingService paperProcessingService;

    @Mock
    private CheckpointService checkpointService;

    @Mock
    private ProjectCollectionService projectCollectionService;
    @Mock
    private SectionStandardEvaluationRepository sectionStandardEvaluationRepository;
    @Mock
    private SectionStandardService sectionStandardService;

    @Test
    void submitForReviewUsesProjectInstructorAndStudent() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(instructor, student);

        when(currentUserService.requireCurrentUser()).thenReturn(student);
        when(projectRepository.findById(project.getId())).thenReturn(Optional.of(project));
        when(feedbackRequestRepository.save(any(FeedbackRequest.class))).thenAnswer(invocation -> {
            FeedbackRequest request = invocation.getArgument(0);
            request.setId(UUID.randomUUID());
            return request;
        });

        FeedbackRequestResponseDto response = service().submitForReview(project.getId(), null);

        verify(currentUserService).requireProjectWriteAccess(student, project);
        ArgumentCaptor<FeedbackRequest> requestCaptor = ArgumentCaptor.forClass(FeedbackRequest.class);
        verify(feedbackRequestRepository).save(requestCaptor.capture());
        assertThat(requestCaptor.getValue().getInstructor()).isEqualTo(instructor);
        assertThat(requestCaptor.getValue().getStudent()).isEqualTo(student);
        assertThat(response.instructorId()).isEqualTo(instructor.getId());
        assertThat(response.studentId()).isEqualTo(student.getId());
    }

    @Test
    void commentCreatesSeparateFeedbackForEachPaperSectionInSameRequest() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(instructor, student);
        FeedbackRequest request = feedbackRequest(project, instructor, student);
        PaperSection intro = section(project, "Introduction");
        PaperSection method = section(project, "Method");

        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(feedbackRequestRepository.findById(request.getId())).thenReturn(Optional.of(request));
        when(paperSectionRepository.findById(intro.getId())).thenReturn(Optional.of(intro));
        when(paperSectionRepository.findById(method.getId())).thenReturn(Optional.of(method));
        when(instructorFeedbackRepository.save(any(InstructorFeedback.class))).thenAnswer(invocation -> {
            InstructorFeedback feedback = invocation.getArgument(0);
            feedback.setId(UUID.randomUUID());
            return feedback;
        });

        service().comment(request.getId(), new InstructorFeedbackRequest(intro.getId(), "L1", "Tighten intro."));
        service().comment(request.getId(), new InstructorFeedbackRequest(method.getId(), "L2", "Clarify method."));

        ArgumentCaptor<InstructorFeedback> captor = ArgumentCaptor.forClass(InstructorFeedback.class);
        verify(instructorFeedbackRepository, times(2)).save(captor.capture());
        assertThat(captor.getAllValues())
                .extracting(feedback -> feedback.getSection().getId())
                .containsExactly(intro.getId(), method.getId());
        assertThat(captor.getAllValues())
                .extracting(InstructorFeedback::getLineReference)
                .containsExactly("L1", "L2");
        assertThat(captor.getAllValues())
                .allSatisfy(feedback -> assertThat(feedback.getRequest()).isEqualTo(request));
    }

    @Test
    void commentRejectsSectionOutsideFeedbackProject() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(instructor, student);
        Project otherProject = project(instructor, student);
        FeedbackRequest request = feedbackRequest(project, instructor, student);
        PaperSection otherSection = section(otherProject, "Other");

        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(feedbackRequestRepository.findById(request.getId())).thenReturn(Optional.of(request));
        when(paperSectionRepository.findById(otherSection.getId())).thenReturn(Optional.of(otherSection));

        assertThatThrownBy(() -> service().comment(
                request.getId(),
                new InstructorFeedbackRequest(otherSection.getId(), "L1", "Wrong project.")))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Section does not belong to feedback project.");
    }

    @Test
    void submitForReviewRejectsProjectAlreadyInReview() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(instructor, student);
        project.setStatus(ProjectStatus.SUBMITTED_FOR_REVIEW);

        when(currentUserService.requireCurrentUser()).thenReturn(student);
        when(projectRepository.findById(project.getId())).thenReturn(Optional.of(project));

        assertThatThrownBy(() -> service().submitForReview(project.getId(), null))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Project is already in review.");
    }

    @Test
    void submitForReviewRejectsCompletedProject() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(instructor, student);
        project.setStatus(ProjectStatus.APPROVED);

        when(currentUserService.requireCurrentUser()).thenReturn(student);
        when(projectRepository.findById(project.getId())).thenReturn(Optional.of(project));

        assertThatThrownBy(() -> service().submitForReview(project.getId(), null))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Only ACTIVE or RETURNED projects can be submitted for review.");
    }

    @Test
    void commentRejectsClosedFeedbackRequest() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(instructor, student);
        FeedbackRequest request = feedbackRequest(project, instructor, student);
        request.setStatus(FeedbackStatus.REVIEWED);

        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(feedbackRequestRepository.findById(request.getId())).thenReturn(Optional.of(request));

        assertThatThrownBy(() -> service().comment(
                request.getId(),
                new InstructorFeedbackRequest(UUID.randomUUID(), "L1", "Too late.")))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Feedback request closed.");
    }

    @Test
    void archivedProjectRejectsInstructorFeedbackCreation() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(instructor, student);
        project.setStatus(ProjectStatus.ARCHIVED);
        FeedbackRequest request = feedbackRequest(project, instructor, student);

        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(feedbackRequestRepository.findById(request.getId())).thenReturn(Optional.of(request));

        assertThatThrownBy(() -> service().comment(
                request.getId(),
                new InstructorFeedbackRequest(UUID.randomUUID(), "L1", "Too late.")))
                .hasMessageContaining("Project is read-only.");
    }

    @Test
    void archivedProjectRejectsAdminFeedbackCreation() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        User admin = user(UserRole.ADMIN);
        Project project = project(instructor, student);
        project.setStatus(ProjectStatus.ARCHIVED);
        FeedbackRequest request = feedbackRequest(project, instructor, student);

        when(currentUserService.requireCurrentUser()).thenReturn(admin);
        when(currentUserService.isAdmin(admin)).thenReturn(true);
        when(feedbackRequestRepository.findById(request.getId())).thenReturn(Optional.of(request));

        assertThatThrownBy(() -> service().comment(
                request.getId(),
                new InstructorFeedbackRequest(UUID.randomUUID(), "L1", "Too late.")))
                .hasMessageContaining("Project is read-only.");
    }

    @Test
    void findAllForCurrentUserUsesRoleScopedRepository() {
        User student = user(UserRole.STUDENT);
        when(currentUserService.requireCurrentUser()).thenReturn(student);
        when(feedbackRequestRepository.findByStudentIdOrderByRequestedAtDesc(student.getId())).thenReturn(List.of());

        assertThat(service().findAllForCurrentUser()).isEmpty();

        verify(feedbackRequestRepository).findByStudentIdOrderByRequestedAtDesc(student.getId());
    }

    @Test
    void submitForReviewRejectsMismatchedInstructor() {
        User instructor = user(UserRole.INSTRUCTOR);
        User other = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(instructor, student);

        when(currentUserService.requireCurrentUser()).thenReturn(student);
        when(projectRepository.findById(project.getId())).thenReturn(Optional.of(project));

        assertThatThrownBy(() -> service().submitForReview(
                project.getId(), new com.evidencepilot.dto.request.SubmitReviewRequest(other.getId())))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Instructor does not match");
    }

    @Test
    void updateStatusTransitionsRequestAndNotifiesStudent() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(instructor, student);
        FeedbackRequest request = feedbackRequest(project, instructor, student);
        request.setStatus(FeedbackStatus.PENDING);
        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(feedbackRequestRepository.findById(request.getId())).thenReturn(Optional.of(request));
        when(feedbackRequestRepository.save(request)).thenReturn(request);

        service().updateStatus(request.getId(), "REVIEWED");

        assertThat(request.getStatus()).isEqualTo(FeedbackStatus.REVIEWED);
        assertThat(project.getStatus()).isEqualTo(ProjectStatus.APPROVED);
        verify(systemNotificationService).createNotification(
                student, instructor, "REVIEW_STATUS_CHANGED", request.getId(),
                "Review status for project \"Capstone\" changed to REVIEWED.");
    }

    @Test
    void updateStatusRejectsUnknownAndPendingValues() {
        assertThatThrownBy(() -> service().updateStatus(UUID.randomUUID(), "unknown"))
                .hasMessageContaining("Invalid status");
        assertThatThrownBy(() -> service().updateStatus(UUID.randomUUID(), "PENDING"))
                .hasMessageContaining("Invalid status");
    }

    @Test
    void updateStatusReturnsProjectToWorkOnRejected() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(instructor, student);
        FeedbackRequest request = feedbackRequest(project, instructor, student);
        request.setStatus(FeedbackStatus.PENDING);
        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(feedbackRequestRepository.findById(request.getId())).thenReturn(Optional.of(request));
        when(feedbackRequestRepository.save(request)).thenReturn(request);

        service().updateStatus(request.getId(), "REJECTED");

        assertThat(request.getStatus()).isEqualTo(FeedbackStatus.REJECTED);
        assertThat(project.getStatus()).isEqualTo(ProjectStatus.IN_PROGRESS);
        verify(projectCollectionService).syncProject(project);
    }

    @Test
    void updateStatusAllowsReturnedToReviewed() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(instructor, student);
        FeedbackRequest request = feedbackRequest(project, instructor, student);
        request.setStatus(FeedbackStatus.RETURNED);
        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(feedbackRequestRepository.findById(request.getId())).thenReturn(Optional.of(request));
        when(feedbackRequestRepository.save(request)).thenReturn(request);

        service().updateStatus(request.getId(), "REVIEWED");

        assertThat(request.getStatus()).isEqualTo(FeedbackStatus.REVIEWED);
        assertThat(project.getStatus()).isEqualTo(ProjectStatus.APPROVED);
    }

    @Test
    void studentCannotApproveViaStatusTransition() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(instructor, student);
        FeedbackRequest request = feedbackRequest(project, instructor, student);
        request.setStatus(FeedbackStatus.PENDING);
        when(currentUserService.requireCurrentUser()).thenReturn(student);
        when(feedbackRequestRepository.findById(request.getId())).thenReturn(Optional.of(request));

        assertThatThrownBy(() -> service().updateStatus(request.getId(), "REVIEWED"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Feedback access denied");

        assertThat(request.getStatus()).isEqualTo(FeedbackStatus.PENDING);
        assertThat(project.getStatus()).isEqualTo(ProjectStatus.IN_PROGRESS);
    }

    @Test
    void updateStatusRejectsIllegalTransitions() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(instructor, student);
        FeedbackRequest reviewed = feedbackRequest(project, instructor, student);
        reviewed.setStatus(FeedbackStatus.REVIEWED);
        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(feedbackRequestRepository.findById(reviewed.getId())).thenReturn(Optional.of(reviewed));

        assertThatThrownBy(() -> service().updateStatus(reviewed.getId(), "RETURNED"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Illegal transition");
    }

    @Test
    void updateStatusRejectsReturnedToReturned() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(instructor, student);
        FeedbackRequest request = feedbackRequest(project, instructor, student);
        request.setStatus(FeedbackStatus.RETURNED);
        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(feedbackRequestRepository.findById(request.getId())).thenReturn(Optional.of(request));

        assertThatThrownBy(() -> service().updateStatus(request.getId(), "RETURNED"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Illegal transition");
    }

    @Test
    void getFeedbackItemsReturnsSectionDetailsAndStaleFlag() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(instructor, student);
        FeedbackRequest request = feedbackRequest(project, instructor, student);
        PaperSection section = section(project, "Introduction");
        section.setVersion(2);
        InstructorFeedback feedback = new InstructorFeedback();
        feedback.setId(UUID.randomUUID());
        feedback.setRequest(request);
        feedback.setSection(section);
        feedback.setInstructor(instructor);
        feedback.setLineReference("L1");
        feedback.setContent("Tighten intro.");
        feedback.setSectionVersion(1);

        when(currentUserService.requireCurrentUser()).thenReturn(student);
        when(feedbackRequestRepository.findById(request.getId())).thenReturn(Optional.of(request));
        when(instructorFeedbackRepository.findByRequestId(request.getId())).thenReturn(List.of(feedback));
        when(paperSectionRepository.findAllById(List.of(section.getId()))).thenReturn(List.of(section));

        var items = service().getFeedbackItems(request.getId());

        assertThat(items).hasSize(1);
        assertThat(items.get(0).sectionTitle()).isEqualTo("Introduction");
        assertThat(items.get(0).sectionVersion()).isEqualTo(1);
        assertThat(items.get(0).stale()).isTrue();
    }

    @Test
    void getFeedbackItemsMarksFreshAnchorsNotStale() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(instructor, student);
        FeedbackRequest request = feedbackRequest(project, instructor, student);
        PaperSection section = section(project, "Method");
        section.setVersion(2);
        InstructorFeedback feedback = new InstructorFeedback();
        feedback.setId(UUID.randomUUID());
        feedback.setRequest(request);
        feedback.setSection(section);
        feedback.setInstructor(instructor);
        feedback.setContent("Clarify method.");
        feedback.setSectionVersion(2);

        when(currentUserService.requireCurrentUser()).thenReturn(student);
        when(feedbackRequestRepository.findById(request.getId())).thenReturn(Optional.of(request));
        when(instructorFeedbackRepository.findByRequestId(request.getId())).thenReturn(List.of(feedback));
        when(paperSectionRepository.findAllById(List.of(section.getId()))).thenReturn(List.of(section));

        var items = service().getFeedbackItems(request.getId());

        assertThat(items.get(0).stale()).isFalse();
    }

    @Test
    void getFeedbackItemsRejectsOutsider() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        User outsider = user(UserRole.STUDENT);
        Project project = project(instructor, student);
        FeedbackRequest request = feedbackRequest(project, instructor, student);

        when(currentUserService.requireCurrentUser()).thenReturn(outsider);
        when(feedbackRequestRepository.findById(request.getId())).thenReturn(Optional.of(request));

        assertThatThrownBy(() -> service().getFeedbackItems(request.getId()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Feedback access denied.");
    }

    @Test
    void updateFeedbackItemEditsContentAndBumpsAudit() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(instructor, student);
        FeedbackRequest request = feedbackRequest(project, instructor, student);
        request.setStatus(FeedbackStatus.PENDING);
        PaperSection section = section(project, "Intro");
        InstructorFeedback feedback = feedback(instructor, request, section);
        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(instructorFeedbackRepository.findById(feedback.getId())).thenReturn(Optional.of(feedback));
        when(instructorFeedbackRepository.save(any(InstructorFeedback.class))).thenReturn(feedback);

        var updated = service().updateFeedbackItem(
                feedback.getId(), new InstructorFeedbackRequest(section.getId(), "L9", "Reworded."));

        assertThat(updated.content()).isEqualTo("Reworded.");
        assertThat(updated.lineReference()).isEqualTo("L9");
        assertThat(updated.updatedBy()).isEqualTo(instructor.getId());
        assertThat(feedback.getUpdatedBy()).isEqualTo(instructor);
    }

    @Test
    void updateFeedbackItemRejectsAnsweredItem() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(instructor, student);
        FeedbackRequest request = feedbackRequest(project, instructor, student);
        request.setStatus(FeedbackStatus.RETURNED);
        PaperSection section = section(project, "Intro");
        InstructorFeedback feedback = feedback(instructor, request, section);
        feedback.setAnswered(true);
        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(instructorFeedbackRepository.findById(feedback.getId())).thenReturn(Optional.of(feedback));

        assertThatThrownBy(() -> service().updateFeedbackItem(
                feedback.getId(), new InstructorFeedbackRequest(section.getId(), null, "Nope.")))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Answered feedback is immutable.");
    }

    @Test
    void updateFeedbackItemRejectsNonAuthor() {
        User instructor = user(UserRole.INSTRUCTOR);
        User other = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(instructor, student);
        FeedbackRequest request = feedbackRequest(project, instructor, student);
        request.setStatus(FeedbackStatus.PENDING);
        PaperSection section = section(project, "Intro");
        InstructorFeedback feedback = feedback(instructor, request, section);
        when(currentUserService.requireCurrentUser()).thenReturn(other);
        when(instructorFeedbackRepository.findById(feedback.getId())).thenReturn(Optional.of(feedback));

        assertThatThrownBy(() -> service().updateFeedbackItem(
                feedback.getId(), new InstructorFeedbackRequest(section.getId(), null, "Nope.")))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Feedback access denied.");
    }

    @Test
    void deleteFeedbackItemDeletesWhenEditable() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(instructor, student);
        FeedbackRequest request = feedbackRequest(project, instructor, student);
        request.setStatus(FeedbackStatus.PENDING);
        PaperSection section = section(project, "Intro");
        InstructorFeedback feedback = feedback(instructor, request, section);
        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(instructorFeedbackRepository.findById(feedback.getId())).thenReturn(Optional.of(feedback));

        service().deleteFeedbackItem(feedback.getId());

        verify(instructorFeedbackRepository).delete(feedback);
    }

    @Test
    void deleteFeedbackItemRejectsAnsweredItem() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(instructor, student);
        FeedbackRequest request = feedbackRequest(project, instructor, student);
        request.setStatus(FeedbackStatus.RETURNED);
        PaperSection section = section(project, "Intro");
        InstructorFeedback feedback = feedback(instructor, request, section);
        feedback.setAnswered(true);
        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(instructorFeedbackRepository.findById(feedback.getId())).thenReturn(Optional.of(feedback));

        assertThatThrownBy(() -> service().deleteFeedbackItem(feedback.getId()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Answered feedback is immutable.");
    }

    @Test
    void answerFeedbackKeepsRequestAndProjectReturned() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(instructor, student);
        project.setStatus(ProjectStatus.RETURNED);
        FeedbackRequest request = feedbackRequest(project, instructor, student);
        request.setStatus(FeedbackStatus.RETURNED);
        PaperSection section = section(project, "Intro");
        InstructorFeedback feedback = feedback(instructor, request, section);

        when(currentUserService.requireCurrentUser()).thenReturn(student);
        when(instructorFeedbackRepository.findById(feedback.getId())).thenReturn(Optional.of(feedback));
        when(instructorFeedbackRepository.save(any(InstructorFeedback.class))).thenReturn(feedback);

        service().answerFeedback(feedback.getId(), "Fixed.");

        // Answering must never approve; the student can still revise and resubmit.
        assertThat(feedback.isAnswered()).isTrue();
        assertThat(feedback.getAnswerContent()).isEqualTo("Fixed.");
        assertThat(request.getStatus()).isEqualTo(FeedbackStatus.RETURNED);
        assertThat(project.getStatus()).isEqualTo(ProjectStatus.RETURNED);
        assertThat(project.getStatus().isReadOnly()).isFalse();
        verify(feedbackRequestRepository, never()).save(any());
        verify(projectRepository, never()).save(any());
        verify(checkpointService, never()).capture(any(), any());
        verify(systemNotificationService).createNotification(
                instructor, student, "FEEDBACK_ANSWERED", request.getId(),
                student.getEmail() + " answered feedback on project \"Capstone\".");
    }

    @Test
    void answeredReturnedProjectCanBeResubmittedForReview() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(instructor, student);
        project.setStatus(ProjectStatus.RETURNED);

        when(currentUserService.requireCurrentUser()).thenReturn(student);
        when(projectRepository.findById(project.getId())).thenReturn(Optional.of(project));
        when(feedbackRequestRepository.save(any(FeedbackRequest.class))).thenAnswer(invocation -> {
            FeedbackRequest saved = invocation.getArgument(0);
            saved.setId(UUID.randomUUID());
            return saved;
        });

        service().submitForReview(project.getId(), null);

        assertThat(project.getStatus()).isEqualTo(ProjectStatus.SUBMITTED_FOR_REVIEW);
    }

    @Test
    void submitForReviewChecksEveryPaperAndRejectsConfiguredOnlyStandard() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(instructor, student);
        PaperSection first = section(project, "Introduction");
        PaperSection second = section(project, "Method");
        first.setActive(true);
        second.setActive(true);
        SectionStandardEvaluation passed = evaluation(first, SectionStandardEvaluation.STATUS_PASSED, 100);
        SectionStandardEvaluation configured = evaluation(second, SectionStandardEvaluation.STATUS_CONFIGURED, null);

        when(currentUserService.requireCurrentUser()).thenReturn(student);
        when(projectRepository.findById(project.getId())).thenReturn(Optional.of(project));
        when(documentRepository.findByProjectIdAndDocTypeAndActiveTrue(any(), any()))
                .thenReturn(List.of(first.getDocument(), second.getDocument()));
        when(paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(first.getDocument().getId()))
                .thenReturn(List.of(first));
        when(paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(second.getDocument().getId()))
                .thenReturn(List.of(second));
        when(sectionStandardEvaluationRepository.findTopBySectionIdOrderByUpdatedAtDesc(first.getId()))
                .thenReturn(Optional.of(passed));
        when(sectionStandardEvaluationRepository.findTopBySectionIdOrderByUpdatedAtDesc(second.getId()))
                .thenReturn(Optional.of(configured));
        when(sectionStandardService.matchesCurrentInput(passed, first)).thenReturn(true);

        assertThatThrownBy(() -> service().submitForReview(project.getId(), null))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("STANDARD_CHECK_REQUIRED")
                .hasMessageContaining(second.getId().toString());

        verify(feedbackRequestRepository, never()).save(any());
        verify(projectRepository, never()).save(any());
    }

    @Test
    void submitForReviewRejectsEvaluationForStaleContent() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(instructor, student);
        PaperSection section = section(project, "Introduction");
        section.setActive(true);
        SectionStandardEvaluation passed = evaluation(section, SectionStandardEvaluation.STATUS_PASSED, 100);

        when(currentUserService.requireCurrentUser()).thenReturn(student);
        when(projectRepository.findById(project.getId())).thenReturn(Optional.of(project));
        when(documentRepository.findByProjectIdAndDocTypeAndActiveTrue(any(), any()))
                .thenReturn(List.of(section.getDocument()));
        when(paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(section.getDocument().getId()))
                .thenReturn(List.of(section));
        when(sectionStandardEvaluationRepository.findTopBySectionIdOrderByUpdatedAtDesc(section.getId()))
                .thenReturn(Optional.of(passed));
        when(sectionStandardService.matchesCurrentInput(passed, section)).thenReturn(false);

        assertThatThrownBy(() -> service().submitForReview(project.getId(), null))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("STANDARD_CHECK_REQUIRED")
                .hasMessageContaining(section.getId().toString());

        verify(feedbackRequestRepository, never()).save(any());
        verify(projectRepository, never()).save(any());
    }

    private InstructorFeedback feedback(User instructor, FeedbackRequest request, PaperSection section) {
        InstructorFeedback feedback = new InstructorFeedback();
        feedback.setId(UUID.randomUUID());
        feedback.setRequest(request);
        feedback.setSection(section);
        feedback.setInstructor(instructor);
        feedback.setContent("Original.");
        feedback.setSectionVersion(section.getVersion());
        return feedback;
    }

    private SectionStandardEvaluation evaluation(PaperSection section, String status, Integer score) {
        SectionStandardEvaluation evaluation = new SectionStandardEvaluation();
        evaluation.setSectionId(section.getId());
        evaluation.setDocumentId(section.getDocument().getId());
        evaluation.setProjectId(section.getDocument().getProject().getId());
        evaluation.setStatus(status);
        evaluation.setScorePercent(score);
        evaluation.setPassThreshold(70);
        return evaluation;
    }

    private FeedbackServiceImpl service() {
        return new FeedbackServiceImpl(
                feedbackRequestRepository,
                instructorFeedbackRepository,
                paperSectionRepository,
                documentRepository,
                projectRepository,
                currentUserService,
                systemNotificationService,
                paperProcessingService,
                checkpointService,
                projectCollectionService,
                sectionStandardEvaluationRepository,
                sectionStandardService);
    }

    private User user(UserRole role) {
        User user = new User();
        user.setId(UUID.randomUUID());
        user.setEmail(user.getId() + "@example.com");
        user.setRole(role);
        return user;
    }

    private Project project(User instructor, User student) {
        Project project = new Project();
        project.setId(UUID.randomUUID());
        project.setTitle("Capstone");
        project.setActive(true);
        project.setStatus(ProjectStatus.IN_PROGRESS);

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

    private FeedbackRequest feedbackRequest(Project project, User instructor, User student) {
        FeedbackRequest request = new FeedbackRequest();
        request.setId(UUID.randomUUID());
        request.setProject(project);
        request.setInstructor(instructor);
        request.setStudent(student);
        return request;
    }

    private PaperSection section(Project project, String title) {
        Document document = new Document();
        document.setId(UUID.randomUUID());
        document.setProject(project);

        PaperSection section = new PaperSection();
        section.setId(UUID.randomUUID());
        section.setDocument(document);
        section.setSectionTitle(title);
        section.setSectionOrder(1);
        section.setContentTex(title);
        return section;
    }
}
