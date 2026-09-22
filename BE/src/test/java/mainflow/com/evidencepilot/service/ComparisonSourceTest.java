package com.evidencepilot.service;

import com.evidencepilot.dto.response.ComparisonSourceDto;
import com.evidencepilot.model.AssignmentSectionBaseline;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.FeedbackRequest;
import com.evidencepilot.model.FeedbackStatus;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.ProjectMember;
import com.evidencepilot.model.ReviewSectionSnapshot;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.AccountStatus;
import com.evidencepilot.model.enums.ProjectRole;
import com.evidencepilot.model.enums.ProjectStatus;
import com.evidencepilot.model.enums.SnapshotType;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.AssignmentSectionBaselineRepository;
import com.evidencepilot.repository.FeedbackRequestRepository;
import com.evidencepilot.repository.InstructorFeedbackRepository;
import com.evidencepilot.repository.PaperSectionRepository;
import com.evidencepilot.repository.ProjectRepository;
import com.evidencepilot.repository.ReviewSectionSnapshotRepository;
import com.evidencepilot.service.impl.CheckpointServiceImpl;
import com.evidencepilot.service.impl.CurrentUserServiceImpl;
import com.evidencepilot.service.impl.FeedbackServiceImpl;
import com.evidencepilot.service.impl.ProjectCollectionService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Comparison-source resolution: latest earlier RETURNED BASELINE, else the
 * initial assignment baseline, else honest null. Never REVIEWED/REJECTED rows,
 * never seeded copies on never-returned requests, never invented data.
 */
@ExtendWith(MockitoExtension.class)
class ComparisonSourceTest {

    @Mock private FeedbackRequestRepository feedbackRequestRepository;
    @Mock private InstructorFeedbackRepository instructorFeedbackRepository;
    @Mock private ReviewSectionSnapshotRepository reviewSectionSnapshotRepository;
    @Mock private PaperSectionRepository paperSectionRepository;
    @Mock private ProjectRepository projectRepository;
    @Mock private CurrentUserServiceImpl currentUserService;
    @Mock private SystemNotificationService systemNotificationService;
    @Mock private CheckpointServiceImpl checkpointService;
    @Mock private ProjectCollectionService projectCollectionService;
    @Mock private SubmissionReadinessService submissionReadinessService;
    @Mock private AssignmentSectionBaselineRepository baselineRepository;

    @Test
    void firstReviewResolvesInitialAssignmentBaseline() {
        Fixture f = fixture(FeedbackStatus.PENDING);
        stubAccess(f, f.active);
        stubSubmitted(f, f.active, "Machine learning systems require extensive testing.", 2);
        when(feedbackRequestRepository.findByProjectIdOrderByRequestedAtDesc(f.project.getId()))
                .thenReturn(List.of(f.active));
        stubInitial(f, "Machine learning systems require testing.", 1);

        ComparisonSourceDto source = service().getComparisonSource(f.active.getId(), f.section.getId());

        assertThat(source.submitted().contentTex())
                .isEqualTo("Machine learning systems require extensive testing.");
        assertThat(source.baseline().contentTex()).isEqualTo("Machine learning systems require testing.");
        assertThat(source.baseline().origin()).isEqualTo(ComparisonSourceDto.Baseline.INITIAL_ASSIGNMENT);
    }

    @Test
    void revisionResolvesLatestReturnBaselineOverInitial() {
        Fixture f = fixture(FeedbackStatus.PENDING);
        FeedbackRequest older = request(f, FeedbackStatus.RETURNED, 2);
        stubAccess(f, f.active);
        stubSubmitted(f, f.active, "Machine learning systems require extensive testing and monitoring.", 3);
        when(feedbackRequestRepository.findByProjectIdOrderByRequestedAtDesc(f.project.getId()))
                .thenReturn(List.of(f.active, older));
        stubSnapshots(older, "Machine learning systems require extensive testing.", 2, SnapshotType.BASELINE);
        stubInitial(f, "Machine learning systems require testing.", 1);

        ComparisonSourceDto source = service().getComparisonSource(f.active.getId(), f.section.getId());

        assertThat(source.baseline().contentTex())
                .isEqualTo("Machine learning systems require extensive testing.");
        assertThat(source.baseline().origin())
                .isEqualTo(ComparisonSourceDto.Baseline.RETURN_FOR_REVISION);
    }

    @Test
    void versionFourToFiveResolvesExactSourceStrings() {
        Fixture f = fixture(FeedbackStatus.PENDING);
        FeedbackRequest older = request(f, FeedbackStatus.RETURNED, 2);
        stubAccess(f, f.active);
        stubSubmitted(f, f.active, "This is a test feedback, this is version 5", 5);
        when(feedbackRequestRepository.findByProjectIdOrderByRequestedAtDesc(f.project.getId()))
                .thenReturn(List.of(f.active, older));
        stubSnapshots(older, "This is a test feedback, this is version 4", 4, SnapshotType.BASELINE);

        ComparisonSourceDto source = service().getComparisonSource(f.active.getId(), f.section.getId());

        assertThat(source.baseline().contentTex())
                .isEqualTo("This is a test feedback, this is version 4");
        assertThat(source.submitted().contentTex())
                .isEqualTo("This is a test feedback, this is version 5");
    }

    @Test
    void thirdRoundUsesLatestReturnNotFirst() {
        Fixture f = fixture(FeedbackStatus.PENDING);
        FeedbackRequest middle = request(f, FeedbackStatus.RETURNED, 2);
        FeedbackRequest first = request(f, FeedbackStatus.RETURNED, 1);
        stubAccess(f, f.active);
        stubSubmitted(f, f.active, "Third text.", 4);
        when(feedbackRequestRepository.findByProjectIdOrderByRequestedAtDesc(f.project.getId()))
                .thenReturn(List.of(f.active, middle, first));
        stubSnapshots(middle, "Second text.", 3, SnapshotType.BASELINE);
        stubSnapshots(first, "First text.", 2, SnapshotType.BASELINE);

        ComparisonSourceDto source = service().getComparisonSource(f.active.getId(), f.section.getId());

        assertThat(source.baseline().contentTex()).isEqualTo("Second text.");
    }

    @Test
    void rejectedPriorRequestContributesNoBaseline() {
        Fixture f = fixture(FeedbackStatus.PENDING);
        FeedbackRequest rejected = request(f, FeedbackStatus.REJECTED, 2);
        stubAccess(f, f.active);
        stubSubmitted(f, f.active, "After reject.", 3);
        when(feedbackRequestRepository.findByProjectIdOrderByRequestedAtDesc(f.project.getId()))
                .thenReturn(List.of(f.active, rejected));
        stubSnapshots(rejected, "Rejected text.", 2, SnapshotType.SUBMITTED);
        stubInitial(f, "Initial text.", 1);

        ComparisonSourceDto source = service().getComparisonSource(f.active.getId(), f.section.getId());

        assertThat(source.baseline().contentTex()).isEqualTo("Initial text.");
        assertThat(source.baseline().origin()).isEqualTo(ComparisonSourceDto.Baseline.INITIAL_ASSIGNMENT);
    }

    @Test
    void seededCopyOnNeverReturnedRequestIsIgnored() {
        Fixture f = fixture(FeedbackStatus.PENDING);
        FeedbackRequest pending = request(f, FeedbackStatus.PENDING, 2);
        stubAccess(f, f.active);
        stubSubmitted(f, f.active, "New text.", 3);
        when(feedbackRequestRepository.findByProjectIdOrderByRequestedAtDesc(f.project.getId()))
                .thenReturn(List.of(f.active, pending));
        stubSnapshots(pending, "Seeded copy text.", 2, SnapshotType.BASELINE);
        org.mockito.Mockito.lenient().when(
                baselineRepository.findByProjectIdAndSectionId(f.project.getId(), f.section.getId()))
                .thenReturn(Optional.empty());

        ComparisonSourceDto source = service().getComparisonSource(f.active.getId(), f.section.getId());

        assertThat(source.baseline()).isNull();
    }

    @Test
    void legacyFirstReviewReportsHonestNull() {
        Fixture f = fixture(FeedbackStatus.PENDING);
        stubAccess(f, f.active);
        stubSubmitted(f, f.active, "Legacy text.", 5);
        when(feedbackRequestRepository.findByProjectIdOrderByRequestedAtDesc(f.project.getId()))
                .thenReturn(List.of(f.active));
        when(baselineRepository.findByProjectIdAndSectionId(f.project.getId(), f.section.getId()))
                .thenReturn(Optional.empty());

        ComparisonSourceDto source = service().getComparisonSource(f.active.getId(), f.section.getId());

        assertThat(source.submitted().contentTex()).isEqualTo("Legacy text.");
        assertThat(source.baseline()).isNull();
    }

    @Test
    void missingSubmittedSnapshotConflicts() {
        Fixture f = fixture(FeedbackStatus.PENDING);
        stubAccess(f, f.active);
        when(paperSectionRepository.findById(f.section.getId())).thenReturn(Optional.of(f.section));
        when(reviewSectionSnapshotRepository.findByRequestIdAndSectionId(f.active.getId(), f.section.getId()))
                .thenReturn(List.of());

        assertThatThrownBy(() -> service().getComparisonSource(f.active.getId(), f.section.getId()))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        error -> assertThat(error.getStatusCode().value()).isEqualTo(409));
    }

    @Test
    void foreignSectionIsRejected() {
        Fixture f = fixture(FeedbackStatus.PENDING);
        PaperSection foreign = section(f.project, f.student);
        foreign.getDocument().setProject(project(f.instructor, f.student, ProjectStatus.IN_PROGRESS));
        stubAccess(f, f.active);
        when(paperSectionRepository.findById(foreign.getId())).thenReturn(Optional.of(foreign));

        assertThatThrownBy(() -> service().getComparisonSource(f.active.getId(), foreign.getId()))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        error -> assertThat(error.getStatusCode().value()).isEqualTo(400));
    }

    private void stubAccess(Fixture f, FeedbackRequest active) {
        org.mockito.Mockito.lenient().when(currentUserService.requireCurrentUser()).thenReturn(f.instructor);
        org.mockito.Mockito.lenient().when(feedbackRequestRepository.findById(active.getId()))
                .thenReturn(Optional.of(active));
        org.mockito.Mockito.lenient().when(paperSectionRepository.findById(f.section.getId()))
                .thenReturn(Optional.of(f.section));
    }

    private void stubSubmitted(Fixture f, FeedbackRequest active, String text, int version) {
        stubSnapshots(active, text, version, SnapshotType.SUBMITTED);
    }

    private void stubSnapshots(FeedbackRequest owner, String text, int version, SnapshotType type) {
        Fixture f = current;
        ReviewSectionSnapshot snapshot = new ReviewSectionSnapshot();
        snapshot.setId(UUID.randomUUID());
        snapshot.setRequest(owner);
        snapshot.setSection(f.section);
        snapshot.setContentTex(text);
        snapshot.setContentVersion(version);
        snapshot.setSnapshotType(type);
        snapshot.setCreatedAt(LocalDateTime.now());
        org.mockito.Mockito.lenient().when(
                reviewSectionSnapshotRepository.findByRequestIdAndSectionId(owner.getId(), f.section.getId()))
                .thenReturn(List.of(snapshot));
    }

    private void stubInitial(Fixture f, String text, int version) {
        AssignmentSectionBaseline baseline = new AssignmentSectionBaseline();
        baseline.setId(UUID.randomUUID());
        baseline.setProject(f.project);
        baseline.setSection(f.section);
        baseline.setContentTex(text);
        baseline.setContentVersion(version);
        baseline.setCreatedAt(LocalDateTime.now().minusDays(7));
        org.mockito.Mockito.lenient().when(
                baselineRepository.findByProjectIdAndSectionId(f.project.getId(), f.section.getId()))
                .thenReturn(Optional.of(baseline));
    }

    private Fixture current;

    private Fixture fixture(FeedbackStatus activeStatus) {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(instructor, student, ProjectStatus.SUBMITTED_FOR_REVIEW);
        PaperSection section = section(project, student);
        FeedbackRequest active = request(project, instructor, student, activeStatus, 3);
        current = new Fixture(instructor, student, project, section, active);
        return current;
    }

    private FeedbackRequest request(Fixture f, FeedbackStatus status, int daysAgo) {
        return request(f.project, f.instructor, f.student, status, daysAgo);
    }

    private FeedbackRequest request(Project project, User instructor, User student,
                                    FeedbackStatus status, int daysAgo) {
        FeedbackRequest request = new FeedbackRequest();
        request.setId(UUID.randomUUID());
        request.setProject(project);
        request.setInstructor(instructor);
        request.setStudent(student);
        request.setStatus(status);
        request.setRequestedAt(LocalDateTime.now().minusDays(daysAgo));
        request.setUpdatedAt(LocalDateTime.now().minusDays(daysAgo));
        return request;
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
                baselineRepository,
                new FeedbackAnchorService(instructorFeedbackRepository, mapper),
                org.mockito.Mockito.mock(FeedbackAttachmentService.class),
                org.mockito.Mockito.mock(org.springframework.context.ApplicationEventPublisher.class));
    }

    private record Fixture(User instructor, User student, Project project,
                           PaperSection section, FeedbackRequest active) {
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
}
