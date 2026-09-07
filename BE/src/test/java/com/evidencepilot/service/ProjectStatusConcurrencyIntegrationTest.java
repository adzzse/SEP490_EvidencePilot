package com.evidencepilot.service;

import com.evidencepilot.dto.request.SubmitReviewRequest;
import com.evidencepilot.dto.request.InstructorFeedbackRequest;
import com.evidencepilot.dto.request.FeedbackAnchorRequest;
import com.evidencepilot.exception.SubmissionReadinessException;
import com.evidencepilot.model.Document;
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
import com.evidencepilot.repository.FeedbackReplyRepository;
import com.evidencepilot.repository.FeedbackRequestRepository;
import com.evidencepilot.repository.InstructorFeedbackRepository;
import com.evidencepilot.repository.PaperSectionRepository;
import com.evidencepilot.repository.ProjectMemberRepository;
import com.evidencepilot.repository.ProjectRepository;
import com.evidencepilot.repository.UserRepository;
import io.minio.MinioClient;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;

@SpringBootTest
class ProjectStatusConcurrencyIntegrationTest {

    @Autowired
    private FeedbackService feedbackService;

    @Autowired
    private ProjectService projectService;

    @Autowired
    private PaperProcessingService paperProcessingService;

    @Autowired
    private SubmissionReadinessService submissionReadinessService;

    @Autowired
    private SectionStandardService sectionStandardService;

    @Autowired
    private UserRepository users;

    @Autowired
    private ProjectRepository projects;

    @Autowired
    private ProjectMemberRepository projectMembers;

    @Autowired
    private DocumentRepository documents;

    @Autowired
    private PaperSectionRepository sections;

    @Autowired
    private FeedbackRequestRepository feedbackRequests;

    @Autowired
    private FeedbackReplyRepository feedbackReplies;

    @Autowired
    private InstructorFeedbackRepository feedbackItems;

    @MockBean
    private SystemNotificationService notifications;

    @MockBean
    private AuditService audit;

    @MockBean
    private CheckpointService checkpoints;

    @MockBean(name = "minioClient")
    private MinioClient minioClient;

    @MockBean
    private RabbitTemplate rabbitTemplate;

    @AfterEach
    void clean() {
        feedbackReplies.deleteAll();
        feedbackItems.deleteAll();
        feedbackRequests.deleteAll();
        sections.deleteAll();
        documents.deleteAll();
        projectMembers.deleteAll();
        projects.deleteAll();
        users.deleteAll();
        SecurityContextHolder.clearContext();
    }

    @Test
    void assignedMemberReadsAndAnswersAfterSubmitterLeavesButRemovedAccountsCannotRead() {
        User instructor = saveUser(UserRole.INSTRUCTOR);
        User submitter = saveUser(UserRole.STUDENT);
        User member = saveUser(UserRole.STUDENT);
        User outsider = saveUser(UserRole.STUDENT);
        Project project = saveProject(ProjectStatus.ASSIGNED, instructor, submitter);
        saveMember(project, member, ProjectRole.MEMBER);
        Document paper = savePaper(project, submitter);
        PaperSection section = new PaperSection();
        section.setDocument(paper);
        section.setSectionTitle("Introduction");
        section.setSectionOrder(0);
        section.setContentTex("Before target after");
        section.setAssignedUser(member);
        section = sections.saveAndFlush(section);
        authenticate(member);
        submissionReadinessService.confirm(paper.getId(), section.getId(), sectionStandardService.inputFingerprint(section));
        authenticate(submitter);
        var round = feedbackService.submitForReview(project.getId(), new SubmitReviewRequest(
                submissionReadinessService.readiness(project.getId()).submissionFingerprint()));
        authenticate(instructor);
        var feedback = feedbackService.comment(round.id(), new InstructorFeedbackRequest(section.getId(), null,
                "Explain the target", new FeedbackAnchorRequest(7, 13, section.getVersion(),
                FeedbackAnchorService.fingerprint(section.getContentTex()), "latex-source-lf-v1", "utf16")));
        feedbackService.updateStatus(round.id(), "RETURNED");
        authenticate(submitter);
        assertThat(feedbackService.getFeedbackItems(round.id()).getFirst().canAnswer()).isFalse();
        assertThatThrownBy(() -> feedbackService.answerFeedback(feedback.id(), "Not assigned"))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("403");
        projectMembers.deleteAll(projectMembers.findByProjectIdAndUserId(project.getId(), submitter.getId()));
        assertThat(feedbackService.findAllForCurrentUser()).noneMatch(item -> item.id().equals(round.id()));
        assertThatThrownBy(() -> feedbackService.getSubmissionSnapshot(round.id()))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("403");
        authenticate(outsider);
        assertThatThrownBy(() -> feedbackService.getFeedbackItems(round.id()))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("403");
        authenticate(member);
        assertThat(feedbackService.findAllForCurrentUser()).anyMatch(item -> item.id().equals(round.id()));
        assertThat(feedbackService.getSubmissionSnapshot(round.id())).isNotNull();
        assertThat(feedbackService.getFeedbackItems(round.id()).getFirst().canAnswer()).isTrue();
        assertThat(feedbackService.answerFeedback(feedback.id(), "Member answer\nSecond line").answerContent())
                .isEqualTo("Member answer\nSecond line");
        authenticate(instructor);
        var stored = feedbackService.getFeedbackItems(round.id()).getFirst();
        assertThat(stored.answerContent()).isEqualTo("Member answer\nSecond line");
        assertThat(stored.anchor().original().exact()).isEqualTo("target");
        projectMembers.deleteAll(projectMembers.findByProjectIdAndUserId(project.getId(), member.getId()));
        authenticate(member);
        assertThat(feedbackService.findAllForCurrentUser()).noneMatch(item -> item.id().equals(round.id()));
        assertThatThrownBy(() -> feedbackService.getFeedbackItems(round.id()))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("403");
        assertThatThrownBy(() -> feedbackService.getSubmissionSnapshot(round.id()))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("403");
        assertThatThrownBy(() -> feedbackService.answerFeedback(feedback.id(), "Removed"))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("403");
    }

    @Test
    void simultaneousSubmissionsCreateExactlyOneFeedbackRequest() throws Exception {
        User instructor = saveUser(UserRole.INSTRUCTOR);
        User student = saveUser(UserRole.STUDENT);
        Project project = saveProject(ProjectStatus.ASSIGNED, instructor, student);
        Document paper = savePaper(project, student);
        PaperSection section = new PaperSection();
        section.setDocument(paper);
        section.setSectionTitle("Introduction");
        section.setSectionOrder(0);
        section.setContentTex("Ready for review");
        section.setAssignedUser(student);
        section = sections.saveAndFlush(section);
        authenticate(student);
        submissionReadinessService.confirm(
                paper.getId(), section.getId(), sectionStandardService.inputFingerprint(section));
        String fingerprint = submissionReadinessService.readiness(project.getId())
                .submissionFingerprint();

        AtomicInteger successes = new AtomicInteger();
        AtomicInteger conflicts = new AtomicInteger();
        runTogether(
                () -> submitForReview(student, project.getId(), fingerprint, successes, conflicts),
                () -> submitForReview(student, project.getId(), fingerprint, successes, conflicts));

        assertThat(successes).hasValue(1);
        assertThat(conflicts).hasValue(1);
        assertThat(feedbackRequests.findByProjectIdOrderByRequestedAtDesc(project.getId())).hasSize(1);
        Project stored = projects.findById(project.getId()).orElseThrow();
        assertThat(stored.getStatus()).isEqualTo(ProjectStatus.SUBMITTED_FOR_REVIEW);
    }

    @Test
    void simultaneousArchivesLeaveExactlyOneWinner() throws Exception {
        User instructor = saveUser(UserRole.INSTRUCTOR);
        User student = saveUser(UserRole.STUDENT);
        Project project = saveProject(ProjectStatus.APPROVED, instructor, student);

        AtomicInteger entered = new AtomicInteger();
        CountDownLatch release = new CountDownLatch(1);
        doAnswer(invocation -> {
            if (entered.incrementAndGet() == 2) {
                release.countDown();
            } else {
                release.await(2, TimeUnit.SECONDS);
            }
            return null;
        }).when(audit).record(anyString(), anyString(), any(), any(), any(), any());

        AtomicInteger successes = new AtomicInteger();
        AtomicInteger conflicts = new AtomicInteger();
        runTogether(
                () -> archive(instructor, project.getId(), successes, conflicts),
                () -> archive(instructor, project.getId(), successes, conflicts));

        assertThat(successes).hasValue(1);
        assertThat(conflicts).hasValue(1);
        Project stored = projects.findById(project.getId()).orElseThrow();
        assertThat(stored.getStatus()).isEqualTo(ProjectStatus.ARCHIVED);
    }

    @Test
    void simultaneousSectionEditsLeaveExactlyOneWinner() throws Exception {
        User instructor = saveUser(UserRole.INSTRUCTOR);
        User student = saveUser(UserRole.STUDENT);
        Project project = saveProject(ProjectStatus.ASSIGNED, instructor, student);
        Document paper = savePaper(project, student);
        PaperSection section = new PaperSection();
        section.setDocument(paper);
        section.setSectionTitle("Intro");
        section.setSectionOrder(1);
        section.setContentTex("original");
        section.setAssignedUser(student);
        PaperSection savedSection = sections.saveAndFlush(section);

        AtomicInteger successes = new AtomicInteger();
        AtomicInteger conflicts = new AtomicInteger();
        long expectedRevision = savedSection.getOptVersion();
        runTogether(
                () -> updateSectionContent(student, paper.getId(), savedSection.getId(),
                        "version-A", expectedRevision, successes, conflicts),
                () -> updateSectionContent(student, paper.getId(), savedSection.getId(),
                        "version-B", expectedRevision, successes, conflicts));

        assertThat(successes).hasValue(1);
        assertThat(conflicts).hasValue(1);
        PaperSection stored = sections.findById(savedSection.getId()).orElseThrow();
        assertThat(stored.getContentTex()).isIn("version-A", "version-B");
        assertThat(stored.getPreviousContentTex()).isEqualTo("original");
        assertThat(stored.getVersion()).isEqualTo(2);
        assertThat(stored.getOptVersion()).isEqualTo(expectedRevision + 1);
    }

    @Test
    void assignedSectionCanBeSavedUsingTheReturnedRevision() {
        User instructor = saveUser(UserRole.INSTRUCTOR);
        User student = saveUser(UserRole.STUDENT);
        Project project = saveProject(ProjectStatus.CREATED, instructor, student);
        Document paper = savePaper(project, student);
        PaperSection section = new PaperSection();
        section.setDocument(paper);
        section.setSectionTitle("Introduction");
        section.setSectionOrder(0);
        section.setContentTex("Original text");
        section = sections.saveAndFlush(section);

        authenticate(instructor);
        var assigned = paperProcessingService.assignSection(paper.getId(), section.getId(), student.getId());
        assertThat(assigned.revision()).isEqualTo(sections.findById(section.getId()).orElseThrow().getOptVersion());

        authenticate(student);
        var updated = paperProcessingService.updateSection(paper.getId(), section.getId(),
                null, null, null, "Updated after assignment", assigned.revision());
        assertThat(updated.contentTex()).isEqualTo("Updated after assignment");
    }

    @Test
    void selfCheckAuthorizesTheAssignedStudentWithoutARequestSession() {
        User instructor = saveUser(UserRole.INSTRUCTOR);
        User student = saveUser(UserRole.STUDENT);
        Project project = saveProject(ProjectStatus.ASSIGNED, instructor, student);
        Document paper = savePaper(project, student);
        PaperSection section = new PaperSection();
        section.setDocument(paper);
        section.setSectionTitle("Introduction");
        section.setSectionOrder(0);
        section.setContentTex("Worker authorization fixture");
        section.setAssignedUser(student);
        section = sections.saveAndFlush(section);
        SecurityContextHolder.clearContext();

        PaperSection authorized = sectionStandardService.requireEvaluationAccess(paper.getId(), section.getId(), student);

        assertThat(authorized.getId()).isEqualTo(section.getId());
        assertThat(authorized.getDocument().getProject().getId()).isEqualTo(project.getId());
    }

    private void submitForReview(User student, UUID projectId, String fingerprint,
            AtomicInteger successes, AtomicInteger conflicts) {
        authenticate(student);
        try {
            feedbackService.submitForReview(projectId, new SubmitReviewRequest(fingerprint));
            successes.incrementAndGet();
        } catch (ObjectOptimisticLockingFailureException | SubmissionReadinessException e) {
            conflicts.incrementAndGet();
        } catch (ResponseStatusException e) {
            if (e.getStatusCode().value() == 409) {
                conflicts.incrementAndGet();
            } else {
                throw e;
            }
        }
    }

    private void archive(User instructor, UUID projectId,
            AtomicInteger successes, AtomicInteger conflicts) {
        authenticate(instructor);
        try {
            projectService.archiveProject(projectId);
            successes.incrementAndGet();
        } catch (ObjectOptimisticLockingFailureException e) {
            conflicts.incrementAndGet();
        } catch (ResponseStatusException e) {
            if (e.getStatusCode().value() == 409) {
                conflicts.incrementAndGet();
            } else {
                throw e;
            }
        }
    }

    private void updateSectionContent(User student, UUID paperId, UUID sectionId, String content,
            Long expectedRevision,
            AtomicInteger successes, AtomicInteger conflicts) {
        authenticate(student);
        try {
            paperProcessingService.updateSection(
                    paperId, sectionId, null, null, null, content, expectedRevision);
            successes.incrementAndGet();
        } catch (ObjectOptimisticLockingFailureException e) {
            conflicts.incrementAndGet();
        } catch (ResponseStatusException e) {
            if (e.getStatusCode().value() == 409) {
                conflicts.incrementAndGet();
            } else {
                throw e;
            }
        }
    }

    private void authenticate(User user) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(user, null));
    }

    private User saveUser(UserRole role) {
        User user = new User();
        user.setEmail(role.name().toLowerCase() + "-" + UUID.randomUUID() + "@test.com");
        user.setPasswordHash("hash");
        user.setRole(role);
        user.setAccountStatus(AccountStatus.ACTIVE);
        return users.saveAndFlush(user);
    }

    private Project saveProject(ProjectStatus status, User instructor, User student) {
        Project project = new Project();
        project.setTitle("Concurrent Project");
        project.setStatus(status);
        project.setActive(true);
        Project saved = projects.saveAndFlush(project);
        saveMember(saved, instructor, ProjectRole.INSTRUCTOR);
        saveMember(saved, student, ProjectRole.LEADER);
        return saved;
    }

    private void saveMember(Project project, User user, ProjectRole role) {
        ProjectMember member = new ProjectMember();
        member.setProject(project);
        member.setUser(user);
        member.setRole(role);
        member.setJoinedAt(LocalDateTime.now());
        projectMembers.saveAndFlush(member);
    }

    private Document savePaper(Project project, User student) {
        Document doc = new Document();
        doc.setProject(project);
        doc.setUploadedBy(student);
        doc.setDocType(DocumentType.PAPER);
        doc.setFileUrl("s3://test/paper.pdf");
        doc.setOriginalFilename("paper.pdf");
        doc.setProcessingStatus(ProcessingStatus.READY);
        doc.setDownloadToken(UUID.randomUUID().toString());
        return documents.saveAndFlush(doc);
    }

    private static void runTogether(Runnable first, Runnable second) throws Exception {
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var firstFuture = executor.submit(() -> runAfterSignal(first, ready, start));
            var secondFuture = executor.submit(() -> runAfterSignal(second, ready, start));
            assertThat(ready.await(2, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            firstFuture.get(10, TimeUnit.SECONDS);
            secondFuture.get(10, TimeUnit.SECONDS);
        }
    }

    private static void runAfterSignal(Runnable task, CountDownLatch ready, CountDownLatch start) {
        ready.countDown();
        try {
            if (!start.await(2, TimeUnit.SECONDS)) {
                throw new IllegalStateException("Concurrent test did not start");
            }
            task.run();
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(exception);
        }
    }
}
