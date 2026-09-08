package com.evidencepilot.service;

import com.evidencepilot.dto.request.InstructorFeedbackRequest;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.AccountStatus;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.service.impl.FeedbackServiceImpl;
import com.evidencepilot.service.impl.ProjectCollectionService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.UUID;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.when;

@Testcontainers(disabledWithoutDocker = true)
@DataJpaTest(properties = {
        "spring.flyway.enabled=true", "spring.jpa.hibernate.ddl-auto=validate",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.MySQLDialect"
}, showSql = false)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@Import({FeedbackServiceImpl.class, FeedbackAnchorService.class, ObjectMapper.class})
class FeedbackPublicationMySqlTest {
    @Container
    private static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.0.46");

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", MYSQL::getJdbcUrl);
        registry.add("spring.datasource.username", MYSQL::getUsername);
        registry.add("spring.datasource.password", MYSQL::getPassword);
        registry.add("spring.datasource.driver-class-name", MYSQL::getDriverClassName);
    }

    @Autowired private JdbcTemplate jdbc;
    @Autowired private FeedbackServiceImpl service;
    @SpyBean private FeedbackAnchorService anchors;
    @MockBean private CurrentUserService currentUserService;
    @MockBean private SystemNotificationService notifications;
    @MockBean private CheckpointService checkpoints;
    @MockBean private ProjectCollectionService collections;
    @MockBean private SubmissionReadinessService readiness;

    @Test
    void returnWaitsForTheDraftInsertAndPublishesItInTheSameRound() throws Exception {
        UUID actorId = UUID.randomUUID();
        UUID projectId = UUID.randomUUID();
        UUID paperId = UUID.randomUUID();
        UUID sectionId = UUID.randomUUID();
        UUID requestId = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO users (id, email, password_hash, role, account_status)
                VALUES (UUID_TO_BIN(?), 'feedback-lock@example.test', 'hash', 'ADMIN', 'ACTIVE')
                """, actorId.toString());
        jdbc.update("""
                INSERT INTO projects (id, title, status, active)
                VALUES (UUID_TO_BIN(?), 'Concurrent review', 'SUBMITTED_FOR_REVIEW', TRUE)
                """, projectId.toString());
        jdbc.update("""
                INSERT INTO documents (id, project_id, uploaded_by, doc_type, file_url, processing_status, active, download_token)
                VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), UUID_TO_BIN(?), 'PAPER', 'test.tex', 'READY', TRUE, UUID())
                """, paperId.toString(), projectId.toString(), actorId.toString());
        jdbc.update("""
                INSERT INTO paper_sections (id, document_id, section_order, section_title, content_tex, version, active)
                VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), 0, 'Introduction', 'Evidence sentence.', 1, TRUE)
                """, sectionId.toString(), paperId.toString());
        jdbc.update("""
                INSERT INTO feedback_requests (id, project_id, student_id, instructor_id, status, requested_at, flagged)
                VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), UUID_TO_BIN(?), UUID_TO_BIN(?), 'PENDING', NOW(6), FALSE)
                """, requestId.toString(), projectId.toString(), actorId.toString(), actorId.toString());
        String snapshot = new ObjectMapper().writeValueAsString(Map.of(
                "schemaVersion", 1, "projectId", projectId, "papers", List.of(Map.of(
                        "id", paperId, "title", "Paper", "sections", List.of(Map.of(
                                "id", sectionId, "title", "Introduction", "order", 0,
                                "contentTex", "Evidence sentence.", "contentVersion", 1))))));
        jdbc.update("UPDATE feedback_requests SET submission_snapshot_json = ? WHERE id = UUID_TO_BIN(?)",
                snapshot, requestId.toString());

        User actor = new User();
        actor.setId(actorId);
        actor.setRole(UserRole.ADMIN);
        actor.setAccountStatus(AccountStatus.ACTIVE);
        CountDownLatch beforeInsert = new CountDownLatch(1);
        CountDownLatch releaseInsert = new CountDownLatch(1);
        CountDownLatch returnStarted = new CountDownLatch(1);
        AtomicInteger calls = new AtomicInteger();
        when(currentUserService.requireCurrentUser()).thenAnswer(invocation -> {
            if (calls.incrementAndGet() == 2) returnStarted.countDown();
            return actor;
        });
        doAnswer(invocation -> {
            beforeInsert.countDown();
            assertThat(releaseInsert.await(10, TimeUnit.SECONDS)).isTrue();
            return invocation.callRealMethod();
        }).when(anchors).initialize(any(), any());

        try (var executor = Executors.newFixedThreadPool(2)) {
            var draft = executor.submit(() -> service.comment(requestId,
                    new InstructorFeedbackRequest(sectionId, null, "Draft racing with Return")));
            try {
                assertThat(beforeInsert.await(10, TimeUnit.SECONDS)).isTrue();
                var returned = executor.submit(() -> service.updateStatus(requestId, "RETURNED"));
                assertThat(returnStarted.await(5, TimeUnit.SECONDS)).isTrue();
                boolean waitedForDraft = false;
                try {
                    returned.get(1, TimeUnit.SECONDS);
                } catch (TimeoutException expected) {
                    waitedForDraft = true;
                } finally {
                    releaseInsert.countDown();
                }
                var saved = draft.get(10, TimeUnit.SECONDS);
                returned.get(10, TimeUnit.SECONDS);
                assertThat(waitedForDraft).as("Return must wait for the in-flight draft transaction").isTrue();
                assertThat(jdbc.queryForObject("SELECT published_at IS NOT NULL FROM instructor_feedbacks WHERE id = UUID_TO_BIN(?)",
                        Boolean.class, saved.id().toString())).isTrue();
            } finally {
                releaseInsert.countDown();
            }
        }
    }
}
