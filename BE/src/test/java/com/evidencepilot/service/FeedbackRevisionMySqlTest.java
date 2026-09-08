package com.evidencepilot.service;

import com.evidencepilot.dto.request.InstructorFeedbackRequest;
import com.evidencepilot.dto.request.SubmitReviewRequest;
import com.evidencepilot.exception.SubmissionReadinessException;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.AccountStatus;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.service.impl.CurrentUserServiceImpl;
import com.evidencepilot.service.impl.FeedbackServiceImpl;
import com.evidencepilot.service.impl.ProjectCollectionService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Testcontainers(disabledWithoutDocker = true)
@DataJpaTest(properties = {
        "spring.flyway.enabled=true", "spring.jpa.hibernate.ddl-auto=validate",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.MySQLDialect"
}, showSql = false)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@Import({FeedbackServiceImpl.class, FeedbackAnchorService.class, CurrentUserServiceImpl.class,
        SubmissionReadinessService.class, SectionStandardService.class, ProjectCollectionService.class,
        FeedbackRevisionMySqlTest.JsonConfig.class})
class FeedbackRevisionMySqlTest {
    @Container
    private static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.0.46");

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", MYSQL::getJdbcUrl);
        registry.add("spring.datasource.username", MYSQL::getUsername);
        registry.add("spring.datasource.password", MYSQL::getPassword);
        registry.add("spring.datasource.driver-class-name", MYSQL::getDriverClassName);
    }

    @TestConfiguration
    static class JsonConfig {
        @Bean ObjectMapper objectMapper() { return new ObjectMapper().findAndRegisterModules(); }
    }

    @Autowired private JdbcTemplate jdbc;
    @Autowired private FeedbackServiceImpl feedback;
    @Autowired private SubmissionReadinessService readiness;
    @Autowired private ObjectMapper json;
    @MockBean private AiModelClient model;
    @MockBean private SystemNotificationService notifications;
    @MockBean private CheckpointService checkpoints;

    @AfterEach
    void clearActor() { SecurityContextHolder.clearContext(); }

    @Test
    void realHandoffsSubmissionReturnAndRevisionUseThePersistedSnapshot() throws Exception {
        Fixture f = fixture();
        // Template-created papers legitimately have no title.
        jdbc.update("UPDATE documents SET title=NULL WHERE id=UUID_TO_BIN(?)", f.paper().toString());
        login(f.member());
        assertThatThrownBy(() -> readiness.confirm(f.paper(), f.first(), "unused"))
                .isInstanceOfSatisfying(org.springframework.web.server.ResponseStatusException.class,
                        error -> assertThat(error.getStatusCode().value()).isEqualTo(403));
        login(f.instructor());
        assertThatThrownBy(() -> feedback.submitForReview(f.project(), new SubmitReviewRequest("unused")))
                .isInstanceOfSatisfying(org.springframework.web.server.ResponseStatusException.class,
                        error -> assertThat(error.getStatusCode().value()).isEqualTo(403));
        confirm(f, f.leader(), f.first());
        confirm(f, f.member(), f.second());
        login(f.leader());
        var first = feedback.submitForReview(f.project(), new SubmitReviewRequest(readiness.readiness(f.project()).submissionFingerprint()));
        login(f.instructor());
        var root = feedback.comment(first.id(), new InstructorFeedbackRequest(f.first(), null, "Clarify evidence"));
        login(f.member());
        assertThat(feedback.getFeedbackItems(first.id())).isEmpty();
        login(f.instructor());
        feedback.updateStatus(first.id(), "RETURNED");
        login(f.member());
        assertThat(feedback.getFeedbackItems(first.id())).extracting(item -> item.id()).containsExactly(root.id());
        login(f.leader());
        var unchanged = readiness.readiness(f.project());
        assertThat(unchanged.revision().state()).isEqualTo("UNCHANGED");
        assertThatThrownBy(() -> feedback.submitForReview(f.project(), new SubmitReviewRequest(unchanged.submissionFingerprint())))
                .isInstanceOfSatisfying(SubmissionReadinessException.class, error -> assertThat(error.getCode()).isEqualTo("REVISION_UNCHANGED"));
        assertThat(requestCount(f.project())).isEqualTo(1);
        assertThat(projectStatus(f.project())).isEqualTo("RETURNED");

        edit(f.first(), "Revised evidence.");
        confirm(f, f.leader(), f.first());
        var changed = readiness.readiness(f.project());
        assertThat(changed.state()).isEqualTo("READY");
        // A readiness result is advisory: reverting in the database before POST still blocks submission.
        edit(f.first(), "Original evidence.");
        confirm(f, f.leader(), f.first());
        assertThatThrownBy(() -> feedback.submitForReview(f.project(), new SubmitReviewRequest(changed.submissionFingerprint())))
                .isInstanceOfSatisfying(SubmissionReadinessException.class, error -> assertThat(error.getCode()).isEqualTo("REVISION_UNCHANGED"));
        assertThat(requestCount(f.project())).isEqualTo(1);

        edit(f.first(), "Revised evidence.");
        confirm(f, f.leader(), f.first());
        var second = feedback.submitForReview(f.project(), new SubmitReviewRequest(readiness.readiness(f.project()).submissionFingerprint()));
        String stored = jdbc.queryForObject("SELECT submission_snapshot_json FROM feedback_requests WHERE id=UUID_TO_BIN(?)", String.class, second.id().toString());
        assertThat(json.readTree(stored).path("papers").get(0).path("sections").get(0).path("contentTex").asText()).isEqualTo("Revised evidence.");
        assertThat(requestCount(f.project())).isEqualTo(2);
        assertThat(projectStatus(f.project())).isEqualTo("SUBMITTED_FOR_REVIEW");
    }

    @Test
    void testBypassEnforcesPermissionsAndDataAndStoresTruthfulReceipts() throws Exception {
        Fixture f = fixture();
        login(f.leader());
        String fingerprint = readiness.readiness(f.project()).submissionFingerprint();
        assertThatThrownBy(() -> feedback.submitForReview(f.project(), new SubmitReviewRequest(fingerprint)))
                .isInstanceOfSatisfying(SubmissionReadinessException.class,
                        error -> assertThat(error.getCode()).isEqualTo("REVIEW_NOT_READY"));
        for (User actor : List.of(f.member(), f.instructor(), user(UserRole.ADMIN), user(UserRole.STUDENT))) {
            login(actor);
            assertThatThrownBy(() -> feedback.submitForReview(f.project(), new SubmitReviewRequest(fingerprint, true)))
                    .isInstanceOfSatisfying(org.springframework.web.server.ResponseStatusException.class,
                            error -> assertThat(error.getStatusCode().value()).isEqualTo(403));
            assertThat(requestCount(f.project())).isZero();
            assertThat(projectStatus(f.project())).isEqualTo("IN_PROGRESS");
        }
        login(f.leader());
        // Each mutation belongs to this test's own fixture and is restored before the next blocker.
        for (String[] mutation : List.of(
                new String[]{"UPDATE paper_sections SET content_tex='' WHERE id=UUID_TO_BIN(?)", "UPDATE paper_sections SET content_tex='Original evidence.' WHERE id=UUID_TO_BIN(?)", f.first().toString()},
                new String[]{"UPDATE paper_sections SET assigned_user_id=NULL WHERE id=UUID_TO_BIN(?)", "UPDATE paper_sections SET assigned_user_id=UUID_TO_BIN('" + f.leader().getId() + "') WHERE id=UUID_TO_BIN(?)", f.first().toString()},
                new String[]{"UPDATE documents SET processing_status='FAILED' WHERE id=UUID_TO_BIN(?)", "UPDATE documents SET processing_status='READY' WHERE id=UUID_TO_BIN(?)", f.paper().toString()},
                new String[]{"UPDATE documents SET active=FALSE WHERE id=UUID_TO_BIN(?)", "UPDATE documents SET active=TRUE WHERE id=UUID_TO_BIN(?)", f.paper().toString()},
                new String[]{"UPDATE projects SET active=FALSE WHERE id=UUID_TO_BIN(?)", "UPDATE projects SET active=TRUE WHERE id=UUID_TO_BIN(?)", f.project().toString()})) {
            jdbc.update(mutation[0], mutation[2]);
            assertThatThrownBy(() -> feedback.submitForReview(f.project(), new SubmitReviewRequest(fingerprint, true)))
                    .isInstanceOfSatisfying(SubmissionReadinessException.class,
                            error -> assertThat(error.getCode()).isEqualTo("REVIEW_NOT_READY"));
            assertThat(requestCount(f.project())).isZero();
            assertThat(projectStatus(f.project())).isEqualTo("IN_PROGRESS");
            jdbc.update(mutation[1], mutation[2]);
        }
        assertThatThrownBy(() -> feedback.submitForReview(f.project(), new SubmitReviewRequest("0".repeat(64), true)))
                .isInstanceOfSatisfying(SubmissionReadinessException.class,
                        error -> assertThat(error.getCode()).isEqualTo("SUBMISSION_INPUT_CHANGED"));
        assertThat(requestCount(f.project())).isZero();
        assertThat(projectStatus(f.project())).isEqualTo("IN_PROGRESS");
        confirm(f, f.leader(), f.first());
        var receipt = readiness.readiness(f.project()).papers().getFirst().sections().getFirst();
        edit(f.first(), "Edited after confirmation.");
        var assessment = readiness.readiness(f.project());
        var submitted = feedback.submitForReview(f.project(), new SubmitReviewRequest(assessment.submissionFingerprint(), true));
        login(f.instructor());
        var snapshot = feedback.getSubmissionSnapshot(submitted.id()).snapshot();
        var stored = snapshot.path("papers").get(0).path("sections");
        assertThat(stored.get(0).path("handoffState").asText()).isEqualTo("STALE");
        assertThat(stored.get(0).path("confirmedById").asText()).isEqualTo(f.leader().getId().toString());
        assertThat(stored.get(1).path("handoffState").asText()).isEqualTo("UNCONFIRMED");
        assertThat(stored.get(1).path("confirmedById").isNull()).isTrue();
        assertThat(stored.get(1).path("confirmedAt").isNull()).isTrue();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM paper_sections WHERE document_id=UUID_TO_BIN(?) AND handoff_confirmed_by IS NOT NULL", Integer.class, f.paper().toString())).isEqualTo(1);
        feedback.comment(submitted.id(), new InstructorFeedbackRequest(f.first(), null, "Return test submission"));
        feedback.updateStatus(submitted.id(), "RETURNED");
        login(f.leader());
        assertThat(readiness.readiness(f.project()).papers().getFirst().sections().getFirst().confirmedAt()).isEqualTo(receipt.confirmedAt());
        assertThatThrownBy(() -> feedback.submitForReview(f.project(), new SubmitReviewRequest(readiness.readiness(f.project()).submissionFingerprint(), true)))
                .isInstanceOfSatisfying(SubmissionReadinessException.class,
                        error -> assertThat(error.getCode()).isEqualTo("REVISION_UNCHANGED"));
        assertThat(requestCount(f.project())).isEqualTo(1);
        assertThat(projectStatus(f.project())).isEqualTo("RETURNED");
        assertThat(feedback.getSubmissionSnapshot(submitted.id()).snapshot()).isEqualTo(snapshot);
        org.mockito.Mockito.verifyNoInteractions(model);
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void concurrentSubmissionsCreateOnlyOnePendingRequest(boolean bypass) throws Exception {
        Fixture f = fixture();
        if (!bypass) {
            confirm(f, f.leader(), f.first());
            confirm(f, f.member(), f.second());
        }
        login(f.leader());
        String fingerprint = readiness.readiness(f.project()).submissionFingerprint();
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var attempts = List.of(executor.submit(() -> submitTogether(f, fingerprint, start, bypass)),
                    executor.submit(() -> submitTogether(f, fingerprint, start, bypass)));
            start.countDown();
            assertThat(List.of(attempts.get(0).get(15, TimeUnit.SECONDS), attempts.get(1).get(15, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder("PENDING", "409");
        }
        assertThat(requestCount(f.project())).isEqualTo(1);
        assertThat(projectStatus(f.project())).isEqualTo("SUBMITTED_FOR_REVIEW");
    }

    private String submitTogether(Fixture f, String fingerprint, CountDownLatch start, boolean bypass) throws Exception {
        login(f.leader());
        try {
            assertThat(start.await(5, TimeUnit.SECONDS)).isTrue();
            return feedback.submitForReview(f.project(), new SubmitReviewRequest(fingerprint, bypass)).status().name();
        } catch (SubmissionReadinessException error) {
            assertThat(error.getCode()).isEqualTo("REVIEW_NOT_READY");
            return "409";
        } catch (org.springframework.web.server.ResponseStatusException error) {
            assertThat(error.getStatusCode().value()).isEqualTo(409);
            return "409";
        } finally { SecurityContextHolder.clearContext(); }
    }

    private void confirm(Fixture f, User actor, UUID sectionId) {
        login(actor);
        var section = readiness.readiness(f.project()).papers().getFirst().sections().stream()
                .filter(item -> item.id().equals(sectionId)).findFirst().orElseThrow();
        var confirmed = readiness.confirm(f.paper(), sectionId, section.currentInputFingerprint());
        var repeated = readiness.confirm(f.paper(), sectionId, section.currentInputFingerprint());
        assertThat(repeated.confirmedAt()).isEqualTo(confirmed.confirmedAt());
        var loaded = readiness.readiness(f.project()).papers().getFirst().sections().stream()
                .filter(item -> item.id().equals(sectionId)).findFirst().orElseThrow();
        assertThat(loaded.confirmedById()).isEqualTo(actor.getId());
        assertThat(loaded.confirmedAt()).isEqualTo(confirmed.confirmedAt());
    }

    private void edit(UUID section, String content) {
        jdbc.update("UPDATE paper_sections SET content_tex=?, version=version+1 WHERE id=UUID_TO_BIN(?)", content, section.toString());
    }

    private int requestCount(UUID project) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM feedback_requests WHERE project_id=UUID_TO_BIN(?)", Integer.class, project.toString());
    }

    private String projectStatus(UUID project) {
        return jdbc.queryForObject("SELECT status FROM projects WHERE id=UUID_TO_BIN(?)", String.class, project.toString());
    }

    private Fixture fixture() {
        User leader = user(UserRole.STUDENT), member = user(UserRole.STUDENT), instructor = user(UserRole.INSTRUCTOR);
        UUID project = UUID.randomUUID(), paper = UUID.randomUUID(), first = UUID.randomUUID(), second = UUID.randomUUID();
        jdbc.update("INSERT INTO projects (id,title,status,active) VALUES (UUID_TO_BIN(?),'Revision test','IN_PROGRESS',TRUE)", project.toString());
        jdbc.update("INSERT INTO project_members (id,project_id,user_id,role) VALUES (UUID_TO_BIN(?),UUID_TO_BIN(?),UUID_TO_BIN(?),'INSTRUCTOR')", UUID.randomUUID().toString(), project.toString(), instructor.getId().toString());
        jdbc.update("INSERT INTO project_members (id,project_id,user_id,role) VALUES (UUID_TO_BIN(?),UUID_TO_BIN(?),UUID_TO_BIN(?),'LEADER')", UUID.randomUUID().toString(), project.toString(), leader.getId().toString());
        jdbc.update("INSERT INTO project_members (id,project_id,user_id,role) VALUES (UUID_TO_BIN(?),UUID_TO_BIN(?),UUID_TO_BIN(?),'MEMBER')", UUID.randomUUID().toString(), project.toString(), member.getId().toString());
        jdbc.update("INSERT INTO documents (id,project_id,uploaded_by,doc_type,title,file_url,processing_status,active,download_token) VALUES (UUID_TO_BIN(?),UUID_TO_BIN(?),UUID_TO_BIN(?),'PAPER','Paper','fixture.tex','READY',TRUE,UUID())", paper.toString(), project.toString(), leader.getId().toString());
        jdbc.update("INSERT INTO paper_sections (id,document_id,section_order,section_title,content_tex,version,active,assigned_user_id) VALUES (UUID_TO_BIN(?),UUID_TO_BIN(?),0,'Introduction','Original evidence.',1,TRUE,UUID_TO_BIN(?))", first.toString(), paper.toString(), leader.getId().toString());
        jdbc.update("INSERT INTO paper_sections (id,document_id,section_order,section_title,content_tex,version,active,assigned_user_id) VALUES (UUID_TO_BIN(?),UUID_TO_BIN(?),1,'Methods','Study methods.',1,TRUE,UUID_TO_BIN(?))", second.toString(), paper.toString(), member.getId().toString());
        return new Fixture(project, paper, first, second, leader, member, instructor);
    }

    private User user(UserRole role) {
        User actor = new User();
        actor.setId(UUID.randomUUID()); actor.setRole(role); actor.setAccountStatus(AccountStatus.ACTIVE);
        actor.setEmail(actor.getId() + "@example.test");
        jdbc.update("INSERT INTO users (id,email,password_hash,role,account_status) VALUES (UUID_TO_BIN(?),?,'hash',?,'ACTIVE')", actor.getId().toString(), actor.getEmail(), role.name());
        return actor;
    }

    private void login(User actor) {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(actor, null, List.of()));
    }

    private record Fixture(UUID project, UUID paper, UUID first, UUID second, User leader, User member, User instructor) { }
}
