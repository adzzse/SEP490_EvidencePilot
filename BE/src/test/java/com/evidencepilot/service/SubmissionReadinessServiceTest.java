package com.evidencepilot.service;

import com.evidencepilot.exception.SubmissionReadinessException;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.FeedbackRequest;
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
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SubmissionReadinessServiceTest {

    @Mock private ProjectRepository projectRepository;
    @Mock private DocumentRepository documentRepository;
    @Mock private PaperSectionRepository paperSectionRepository;
    @Mock private FeedbackRequestRepository feedbackRequestRepository;
    @Mock private SectionStandardService sectionStandardService;
    @Mock private CurrentUserService currentUserService;

    private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();
    private SubmissionReadinessService service;

    @BeforeEach
    void setUp() {
        service = new SubmissionReadinessService(
                projectRepository, documentRepository, paperSectionRepository,
                feedbackRequestRepository, sectionStandardService,
                currentUserService, objectMapper);
    }

    @Test
    void readinessUsesObjectiveChecksAndMakesChangedHandoffStale() {
        Fixture fixture = fixture();
        stubAssessment(fixture, "f".repeat(64));

        var ready = service.assess(fixture.project(), fixture.leader()).response();

        assertThat(ready.state()).isEqualTo("READY");
        assertThat(ready.canSubmit()).isTrue();
        assertThat(ready.revision().state()).isEqualTo("FIRST_SUBMISSION");
        assertThat(ready.submissionFingerprint()).matches("[0-9a-f]{64}");
        assertThat(ready.checks()).allSatisfy(check ->
                assertThat(check.status()).isEqualTo("SATISFIED"));

        fixture.paper().setTitle("Renamed paper");
        var retitled = service.assess(fixture.project(), fixture.leader()).response();
        assertThat(retitled.submissionFingerprint()).isNotEqualTo(ready.submissionFingerprint());
        fixture.paper().setTitle("Paper");

        fixture.section().setHandoffInputFingerprint("0".repeat(64));
        var changed = service.assess(fixture.project(), fixture.leader()).response();

        assertThat(changed.state()).isEqualTo("NOT_READY");
        assertThat(changed.papers().get(0).sections().get(0).handoffState()).isEqualTo("STALE");
        assertThat(changed.checks()).filteredOn(check -> check.code().equals("SECTION_CONFIRMED"))
                .extracting(check -> check.status()).containsExactly("UNSATISFIED");
    }

    @Test
    void returnedPaperCannotBeSubmittedWithoutAContentChange() {
        Fixture f = fixture();
        stubAssessment(f, "f".repeat(64));
        FeedbackRequest returned = new FeedbackRequest();
        returned.setId(UUID.randomUUID());
        returned.setProject(f.project());
        returned.setStatus(FeedbackStatus.RETURNED);
        returned.setRequestedAt(LocalDateTime.of(2026, 9, 4, 12, 0));
        returned.setSubmissionSnapshotJson(service.snapshot(
                service.assess(f.project(), f.leader()), f.project(), f.leader(),
                f.instructor(), returned.getRequestedAt()));
        f.project().setStatus(ProjectStatus.RETURNED);
        when(feedbackRequestRepository.findByProjectIdOrderByRequestedAtDesc(f.project().getId()))
                .thenReturn(List.of(returned));

        var readiness = service.assess(f.project(), f.leader()).response();

        assertThatThrownBy(() -> service.requireReadyForSubmit(
                f.project(), f.leader(), readiness.submissionFingerprint()))
                .isInstanceOfSatisfying(SubmissionReadinessException.class,
                        error -> assertThat(error.getCode()).isEqualTo("REVISION_UNCHANGED"));
        assertThat(readiness.canSubmit()).isTrue();
        assertThat(readiness.state()).isEqualTo("NOT_READY");
    }

    @Test
    void administrativeChangesAndRecreatedIdsDoNotCountAsARevision() {
        Fixture f = fixture();
        FeedbackRequest returned = stubReturned(f);
        f.section().setVersion(9);
        f.section().setOptVersion(15L);
        f.section().setHandoffContentVersion(9);
        f.section().setHandoffConfirmedAt(LocalDateTime.of(2026, 9, 5, 12, 0));
        f.paper().setId(UUID.randomUUID());
        f.section().setId(UUID.randomUUID());
        when(paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(f.paper().getId()))
                .thenReturn(List.of(f.section()));

        var response = service.assess(f.project(), f.leader()).response();

        assertThat(response.revision().state()).isEqualTo("UNCHANGED");
        assertThat(response.revision().baselineRequestId()).isEqualTo(returned.getId());
        assertThat(response.papers().get(0).sections().get(0).handoffState()).isEqualTo("CONFIRMED");
    }

    @Test
    void changedTextCanBeResubmittedButLineEndingsAndRevertedEditsCannot() {
        Fixture f = fixture();
        f.section().setContentTex("First line\nSecond line");
        stubReturned(f);
        f.section().setContentTex("First line\r\nSecond line");
        assertThat(service.assess(f.project(), f.leader()).response().revision().state())
                .isEqualTo("UNCHANGED");

        f.section().setContentTex("Revised explanation");
        var changed = service.assess(f.project(), f.leader()).response();
        assertThat(changed.revision().state()).isEqualTo("CHANGED");
        assertThat(service.requireReadyForSubmit(f.project(), f.leader(), changed.submissionFingerprint())
                .response().state()).isEqualTo("READY");

        f.section().setContentTex("First line\nSecond line");
        assertThatThrownBy(() -> service.requireReadyForSubmit(
                f.project(), f.leader(), changed.submissionFingerprint()))
                .isInstanceOfSatisfying(SubmissionReadinessException.class,
                        error -> assertThat(error.getCode()).isEqualTo("REVISION_UNCHANGED"));
    }

    @Test
    void titleChangesCountButDoNotBypassHandoffOrFingerprintChecks() {
        Fixture f = fixture();
        stubReturned(f);
        f.paper().setTitle("Revised paper title");
        var changed = service.assess(f.project(), f.leader()).response();
        assertThat(changed.revision().state()).isEqualTo("CHANGED");
        assertThatThrownBy(() -> service.requireReadyForSubmit(f.project(), f.leader(), "stale"))
                .isInstanceOfSatisfying(SubmissionReadinessException.class,
                        error -> assertThat(error.getCode()).isEqualTo("SUBMISSION_INPUT_CHANGED"));
        f.paper().setTitle("Paper");
        f.section().setSectionTitle("Revised section title");
        f.section().setHandoffInputFingerprint("stale");
        var notReady = service.assess(f.project(), f.leader()).response();
        assertThat(notReady.revision().state()).isEqualTo("CHANGED");
        assertThat(notReady.state()).isEqualTo("NOT_READY");
        assertThatThrownBy(() -> service.requireReadyForSubmit(
                f.project(), f.leader(), notReady.submissionFingerprint()))
                .isInstanceOfSatisfying(SubmissionReadinessException.class,
                        error -> assertThat(error.getCode()).isEqualTo("REVIEW_NOT_READY"));
    }

    @Test
    void invalidReturnedSnapshotsBlockSubmissionRatherThanUsingLiveContent() {
        Fixture f = fixture();
        FeedbackRequest returned = stubReturned(f);
        String valid = returned.getSubmissionSnapshotJson();
        for (String invalid : java.util.Arrays.asList(null, "", "[]", "{}", "{invalid",
                valid.replace(f.project().getId().toString(), UUID.randomUUID().toString()),
                valid.replace("\"contentTex\":\"Saved section text\",", ""),
                valid.replace("\"order\":0", "\"order\":null"))) {
            returned.setSubmissionSnapshotJson(invalid);
            var response = service.assess(f.project(), f.leader()).response();
            assertThat(response.revision().state()).as("snapshot %s", invalid).isEqualTo("UNVERIFIABLE");
            assertThatThrownBy(() -> service.requireReadyForSubmit(
                    f.project(), f.leader(), response.submissionFingerprint()))
                    .isInstanceOfSatisfying(SubmissionReadinessException.class,
                            error -> assertThat(error.getCode()).isEqualTo("REVISION_BASELINE_UNAVAILABLE"));
            assertThatThrownBy(() -> service.requireReadyForSubmit(
                    f.project(), f.leader(), response.submissionFingerprint(), true))
                    .isInstanceOfSatisfying(SubmissionReadinessException.class,
                            error -> assertThat(error.getCode()).isEqualTo("REVISION_BASELINE_UNAVAILABLE"));
        }
        when(feedbackRequestRepository.findByProjectIdOrderByRequestedAtDesc(f.project().getId()))
                .thenReturn(List.of());
        assertThat(service.assess(f.project(), f.leader()).response().revision().state())
                .isEqualTo("UNVERIFIABLE");
    }

    @Test
    void revisionBlockerDoesNotGrantSubmissionPermissionToMembers() {
        Fixture f = fixture();
        stubReturned(f);
        f.project().getProjectMembers().get(1).setRole(ProjectRole.MEMBER);
        var response = service.assess(f.project(), f.leader()).response();
        assertThat(response.canSubmit()).isFalse();
        assertThatThrownBy(() -> service.requireReadyForSubmit(
                f.project(), f.leader(), response.submissionFingerprint()))
                .isInstanceOfSatisfying(org.springframework.web.server.ResponseStatusException.class,
                        error -> assertThat(error.getStatusCode().value()).isEqualTo(403));
    }

    @Test
    void sectionOrderMultiplicityAndLatestReturnedBaselineAreCompared() {
        Fixture f = fixture();
        FeedbackRequest older = stubReturned(f);
        PaperSection second = new PaperSection();
        second.setId(UUID.randomUUID()); second.setDocument(f.paper()); second.setActive(true);
        second.setSectionOrder(1); second.setSectionTitle("Methods"); second.setContentTex("Methods body");
        second.setVersion(1); second.setAssignedUser(f.leader());
        second.setHandoffConfirmedBy(f.leader()); second.setHandoffConfirmedAt(LocalDateTime.now());
        second.setHandoffContentVersion(1); second.setHandoffInputFingerprint("s".repeat(64));
        when(sectionStandardService.inputFingerprint(second)).thenReturn("s".repeat(64));
        when(paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(f.paper().getId()))
                .thenReturn(List.of(f.section(), second));
        assertThat(service.assess(f.project(), f.leader()).response().revision().state()).isEqualTo("CHANGED");
        FeedbackRequest latest = new FeedbackRequest();
        latest.setId(UUID.randomUUID()); latest.setStatus(FeedbackStatus.RETURNED);
        latest.setSubmissionSnapshotJson(service.snapshot(service.assess(f.project(), f.leader()),
                f.project(), f.leader(), f.instructor(), LocalDateTime.now()));
        when(feedbackRequestRepository.findByProjectIdOrderByRequestedAtDesc(f.project().getId()))
                .thenReturn(List.of(latest, older));
        assertThat(service.assess(f.project(), f.leader()).response().revision().state()).isEqualTo("UNCHANGED");
        f.section().setSectionOrder(2);
        assertThat(service.assess(f.project(), f.leader()).response().revision().state()).isEqualTo("CHANGED");
        f.section().setSectionOrder(0);
        when(paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(f.paper().getId()))
                .thenReturn(List.of(f.section(), second, second));
        assertThat(service.assess(f.project(), f.leader()).response().revision().state()).isEqualTo("CHANGED");
        latest.setSubmissionSnapshotJson(null);
        assertThat(service.assess(f.project(), f.leader()).response().revision().state()).isEqualTo("UNVERIFIABLE");
    }

    @Test
    void readinessRejectsInactiveAssignee() {
        Fixture fixture = fixture();
        fixture.leader().setAccountStatus(AccountStatus.BANNED);
        stubAssessment(fixture, "f".repeat(64));

        var readiness = service.assess(fixture.project(), fixture.leader()).response();

        assertThat(readiness.state()).isEqualTo("NOT_READY");
        assertThat(readiness.canSubmit()).isFalse();
        assertThat(readiness.checks()).filteredOn(check -> check.code().equals("ASSIGNEE_VALID"))
                .extracting(check -> check.status()).containsExactly("UNSATISFIED");
    }

    @Test
    void confirmRejectsFingerprintChangedAfterPageLoad() {
        Fixture fixture = fixture();
        when(paperSectionRepository.findByIdWithDocument(fixture.section().getId()))
                .thenReturn(Optional.of(fixture.section()));
        when(projectRepository.findByIdForUpdate(fixture.project().getId()))
                .thenReturn(Optional.of(fixture.project()));
        when(currentUserService.requireCurrentUser()).thenReturn(fixture.leader());
        when(sectionStandardService.inputFingerprint(fixture.section())).thenReturn("f".repeat(64));

        assertThatThrownBy(() -> service.confirm(
                fixture.paper().getId(), fixture.section().getId(), "0".repeat(64)))
                .isInstanceOfSatisfying(SubmissionReadinessException.class,
                        error -> assertThat(error.getCode()).isEqualTo("HANDOFF_INPUT_CHANGED"));

        verify(paperSectionRepository, never()).saveAndFlush(fixture.section());
    }

    @Test
    void confirmStoresReceiptForCurrentSavedVersion() {
        Fixture fixture = fixture();
        fixture.section().setHandoffConfirmedBy(null);
        fixture.section().setHandoffConfirmedAt(null);
        fixture.section().setHandoffContentVersion(null);
        fixture.section().setHandoffInputFingerprint(null);
        when(paperSectionRepository.findByIdWithDocument(fixture.section().getId()))
                .thenReturn(Optional.of(fixture.section()));
        when(projectRepository.findByIdForUpdate(fixture.project().getId()))
                .thenReturn(Optional.of(fixture.project()));
        when(currentUserService.requireCurrentUser()).thenReturn(fixture.leader());
        when(sectionStandardService.inputFingerprint(fixture.section())).thenReturn("f".repeat(64));

        var response = service.confirm(
                fixture.paper().getId(), fixture.section().getId(), "f".repeat(64));

        assertThat(response.state()).isEqualTo("CONFIRMED");
        assertThat(response.confirmedById()).isEqualTo(fixture.leader().getId());
        assertThat(response.confirmedContentVersion()).isEqualTo(3);
        assertThat(fixture.section().getHandoffInputFingerprint()).isEqualTo("f".repeat(64));
        verify(currentUserService).requireSectionContentWriteAccess(
                fixture.leader(), fixture.section());
        verify(paperSectionRepository).saveAndFlush(fixture.section());
        assertThat(response.confirmedAt()).isNotNull();
        var repeated = service.confirm(fixture.paper().getId(), fixture.section().getId(), "f".repeat(64));
        assertThat(repeated.confirmedById()).isEqualTo(response.confirmedById());
        assertThat(repeated.confirmedAt()).isEqualTo(response.confirmedAt());
        assertThat(fixture.section().getVersion()).isEqualTo(3);
        verify(paperSectionRepository).saveAndFlush(fixture.section());
    }

    @Test
    void testBypassPreservesMissingAndStaleConfirmations() throws Exception {
        Fixture f = fixture();
        stubAssessment(f, "f".repeat(64));
        for (String state : List.of("STALE", "UNCONFIRMED")) {
            if (state.equals("STALE")) f.section().setHandoffInputFingerprint("stale");
            else {
                f.section().setHandoffConfirmedBy(null);
                f.section().setHandoffConfirmedAt(null);
                f.section().setHandoffContentVersion(null);
                f.section().setHandoffInputFingerprint(null);
            }
            var r = service.assess(f.project(), f.leader()).response();
            assertThatThrownBy(() -> service.requireReadyForSubmit(f.project(), f.leader(), r.submissionFingerprint()))
                    .isInstanceOfSatisfying(SubmissionReadinessException.class,
                            error -> assertThat(error.getCode()).isEqualTo("REVIEW_NOT_READY"));
            var assessment = service.requireReadyForSubmit(f.project(), f.leader(), r.submissionFingerprint(), true);
            var saved = objectMapper.readTree(service.snapshot(assessment, f.project(), f.leader(), f.instructor(), LocalDateTime.now()));
            var section = saved.path("papers").get(0).path("sections").get(0);
            assertThat(section.path("handoffState").asText()).isEqualTo(state);
            assertThat(section.path("confirmedById").isNull()).isEqualTo(state.equals("UNCONFIRMED"));
            assertThat(section.path("confirmedAt").isNull()).isEqualTo(state.equals("UNCONFIRMED"));
            assertThat(assessment.response().state()).isEqualTo("NOT_READY");
            if (state.equals("STALE")) {
                assertThat(section.path("confirmedById").asText()).isEqualTo(f.leader().getId().toString());
                assertThat(f.section().getHandoffInputFingerprint()).isEqualTo("stale");
            } else assertThat(f.section().getHandoffConfirmedBy()).isNull();
        }
        verify(paperSectionRepository, never()).saveAndFlush(f.section());
    }

    @Test
    void confirmRejectsBlankSectionContent() {
        Fixture fixture = fixture();
        fixture.section().setContentTex("  ");
        when(paperSectionRepository.findByIdWithDocument(fixture.section().getId()))
                .thenReturn(Optional.of(fixture.section()));
        when(projectRepository.findByIdForUpdate(fixture.project().getId()))
                .thenReturn(Optional.of(fixture.project()));
        when(currentUserService.requireCurrentUser()).thenReturn(fixture.leader());

        assertThatThrownBy(() -> service.confirm(
                fixture.paper().getId(), fixture.section().getId(), "f".repeat(64)))
                .isInstanceOfSatisfying(SubmissionReadinessException.class,
                        error -> assertThat(error.getCode()).isEqualTo("SECTION_HANDOFF_NOT_READY"));

        verify(paperSectionRepository, never()).saveAndFlush(fixture.section());
    }

    @Test
    void snapshotStoresSubmittedTextAndVersion() throws Exception {
        Fixture fixture = fixture();
        stubAssessment(fixture, "f".repeat(64));
        var assessment = service.assess(fixture.project(), fixture.leader());

        String snapshot = service.snapshot(
                assessment, fixture.project(), fixture.leader(), fixture.instructor(),
                LocalDateTime.of(2026, 9, 4, 12, 0));
        var json = objectMapper.readTree(snapshot);

        assertThat(json.get("papers").get(0).get("sections").get(0).get("contentTex").asText())
                .isEqualTo("Saved section text");
        assertThat(json.get("papers").get(0).get("sections").get(0).get("contentVersion").asInt())
                .isEqualTo(3);
    }

    @Test
    void promptActivationStalesAiResultWithoutRevokingHandoffOrChangingSubmissionIdentity() {
        Fixture f = fixture();
        var templates = org.mockito.Mockito.mock(com.evidencepilot.repository.PromptTemplateRepository.class);
        var evaluations = org.mockito.Mockito.mock(com.evidencepilot.repository.SectionStandardEvaluationRepository.class);
        var transactions = org.mockito.Mockito.mock(org.springframework.transaction.PlatformTransactionManager.class);
        var prompts = new PromptTemplateService(templates, currentUserService, transactions);
        var standards = new SectionStandardService(org.mockito.Mockito.mock(AiModelClient.class), paperSectionRepository,
                evaluations, currentUserService, objectMapper, transactions, prompts);
        service = new SubmissionReadinessService(projectRepository, documentRepository, paperSectionRepository,
                feedbackRequestRepository, standards, currentUserService, objectMapper);
        var original = new com.evidencepilot.model.PromptTemplate();
        original.setId(UUID.randomUUID());
        original.setTemplateKey("CHECK_STANDARD");
        original.setVersion("v1");
        original.setSystemText(PromptTemplateService.CHECK_STANDARD_DEFAULT);
        original.setActive(true);
        var candidate = new com.evidencepilot.model.PromptTemplate();
        candidate.setId(UUID.randomUUID());
        candidate.setTemplateKey("CHECK_STANDARD");
        candidate.setVersion("v2");
        candidate.setSystemText(PromptTemplateService.CHECK_STANDARD_DEFAULT + "\nBe concise.");
        when(templates.findByTemplateKeyAndActiveTrue("CHECK_STANDARD"))
                .thenAnswer(call -> List.of(original, candidate).stream().filter(com.evidencepilot.model.PromptTemplate::isActive).findFirst());
        when(templates.findById(candidate.getId())).thenReturn(Optional.of(candidate));
        when(templates.lockVersions("CHECK_STANDARD")).thenReturn(List.of(original, candidate));
        when(templates.saveAndFlush(candidate)).thenReturn(candidate);
        var evaluation = new com.evidencepilot.model.SectionStandardEvaluation();
        evaluation.setSectionId(f.section().getId());
        evaluation.setDocumentId(f.paper().getId());
        evaluation.setRequirements(List.of("Has thesis"));
        evaluation.setStatus("COMPLETED");
        evaluation.setResultJson("{}");
        when(evaluations.findTopBySectionIdOrderByUpdatedAtDesc(f.section().getId())).thenReturn(Optional.of(evaluation));
        String objective = standards.inputFingerprint(f.section());
        evaluation.setInputFingerprint(objective);
        evaluation.setPromptFingerprint(prompts.resolve("CHECK_STANDARD").fingerprint());
        when(documentRepository.findByProjectIdAndDocTypeAndActiveTrue(f.project().getId(), DocumentType.PAPER)).thenReturn(List.of(f.paper()));
        when(paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(f.paper().getId())).thenReturn(List.of(f.section()));
        when(paperSectionRepository.findByIdWithDocument(f.section().getId())).thenReturn(Optional.of(f.section()));
        when(projectRepository.findByIdForUpdate(f.project().getId())).thenReturn(Optional.of(f.project()));
        when(currentUserService.requireCurrentUser()).thenReturn(f.leader());
        when(paperSectionRepository.saveAndFlush(f.section())).thenReturn(f.section());
        f.section().setHandoffConfirmedBy(null);
        service.confirm(f.paper().getId(), f.section().getId(), objective);
        var confirmedAt = f.section().getHandoffConfirmedAt();
        var before = service.assess(f.project(), f.leader()).response();
        assertThat(before.canSubmit()).isTrue();
        assertThat(standards.latest(f.paper().getId(), f.section().getId()).orElseThrow().stale()).isFalse();

        prompts.activate(candidate.getId());

        assertThat(standards.latest(f.paper().getId(), f.section().getId()).orElseThrow().stale()).isTrue();
        var after = service.assess(f.project(), f.leader()).response();
        assertThat(after.submissionFingerprint()).isEqualTo(before.submissionFingerprint());
        assertThat(after.canSubmit()).isTrue();
        assertThat(after.papers().get(0).sections().get(0).handoffState()).isEqualTo("CONFIRMED");
        assertThat(f.section().getHandoffConfirmedAt()).isEqualTo(confirmedAt);
        org.mockito.Mockito.clearInvocations(templates);
        org.mockito.Mockito.lenient().doThrow(new org.springframework.dao.DataAccessResourceFailureException("offline"))
                .when(templates).findByTemplateKeyAndActiveTrue("CHECK_STANDARD");
        assertThat(service.assess(f.project(), f.leader()).response().submissionFingerprint()).isEqualTo(before.submissionFingerprint());
        assertThat(service.assess(f.project(), f.leader()).response().canSubmit()).isTrue();
        org.mockito.Mockito.verifyNoInteractions(templates);
    }

    private FeedbackRequest stubReturned(Fixture f) {
        stubAssessment(f, "f".repeat(64));
        FeedbackRequest returned = new FeedbackRequest();
        returned.setId(UUID.randomUUID());
        returned.setProject(f.project());
        returned.setStatus(FeedbackStatus.RETURNED);
        returned.setRequestedAt(LocalDateTime.of(2026, 9, 4, 12, 0));
        returned.setSubmissionSnapshotJson(service.snapshot(
                service.assess(f.project(), f.leader()), f.project(), f.leader(),
                f.instructor(), returned.getRequestedAt()));
        f.project().setStatus(ProjectStatus.RETURNED);
        when(feedbackRequestRepository.findByProjectIdOrderByRequestedAtDesc(f.project().getId()))
                .thenReturn(List.of(returned));
        return returned;
    }

    private void stubAssessment(Fixture fixture, String fingerprint) {
        when(documentRepository.findByProjectIdAndDocTypeAndActiveTrue(
                fixture.project().getId(), DocumentType.PAPER)).thenReturn(List.of(fixture.paper()));
        when(paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(fixture.paper().getId()))
                .thenReturn(List.of(fixture.section()));
        when(sectionStandardService.inputFingerprint(fixture.section())).thenReturn(fingerprint);
    }

    private Fixture fixture() {
        User instructor = user(UserRole.INSTRUCTOR);
        User leader = user(UserRole.STUDENT);
        Project project = new Project();
        project.setId(UUID.randomUUID());
        project.setTitle("Capstone");
        project.setActive(true);
        project.setStatus(ProjectStatus.IN_PROGRESS);
        project.setProjectMembers(List.of(
                member(project, instructor, ProjectRole.INSTRUCTOR),
                member(project, leader, ProjectRole.LEADER)));

        Document paper = new Document();
        paper.setId(UUID.randomUUID());
        paper.setTitle("Paper");
        paper.setDocType(DocumentType.PAPER);
        paper.setProcessingStatus(ProcessingStatus.READY);
        paper.setProject(project);
        paper.setActive(true);

        PaperSection section = new PaperSection();
        section.setId(UUID.randomUUID());
        section.setDocument(paper);
        section.setSectionOrder(0);
        section.setSectionTitle("Introduction");
        section.setContentTex("Saved section text");
        section.setVersion(3);
        section.setOptVersion(7L);
        section.setActive(true);
        section.setAssignedUser(leader);
        section.setHandoffConfirmedBy(leader);
        section.setHandoffConfirmedAt(LocalDateTime.of(2026, 9, 4, 11, 0));
        section.setHandoffContentVersion(3);
        section.setHandoffInputFingerprint("f".repeat(64));
        return new Fixture(project, paper, section, leader, instructor);
    }

    private static User user(UserRole role) {
        User user = new User();
        user.setId(UUID.randomUUID());
        user.setRole(role);
        user.setEmail(user.getId() + "@example.com");
        return user;
    }

    private static ProjectMember member(Project project, User user, ProjectRole role) {
        ProjectMember member = new ProjectMember();
        member.setProject(project);
        member.setUser(user);
        member.setRole(role);
        return member;
    }

    private record Fixture(
            Project project, Document paper, PaperSection section,
            User leader, User instructor) {}
}
