package com.evidencepilot.service.impl;

import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.AccountStatus;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.exception.ResourceNotFoundException;
import com.evidencepilot.service.AiModelClient;
import com.evidencepilot.service.AuditService;
import com.evidencepilot.service.PaperStandardService;
import com.evidencepilot.service.QdrantClient;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

@Testcontainers(disabledWithoutDocker = true)
@DataJpaTest(properties = {
        "spring.flyway.enabled=true", "spring.jpa.hibernate.ddl-auto=validate",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.MySQLDialect"
}, showSql = false)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@Import({ProjectSourceUnshareService.class, PaperReferenceService.class, SourceMatchingService.class,
        SparseVectorGenerator.class, CurrentUserServiceImpl.class})
class ProjectSourceUnshareConcurrencyMySqlTest {

    @Container
    private static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.0.46");

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", MYSQL::getJdbcUrl);
        registry.add("spring.datasource.username", MYSQL::getUsername);
        registry.add("spring.datasource.password", MYSQL::getPassword);
        registry.add("spring.datasource.driver-class-name", MYSQL::getDriverClassName);
    }

    @Autowired private JdbcTemplate jdbc;
    @Autowired private ProjectSourceUnshareService unshare;
    @Autowired private PaperReferenceService references;
    @MockBean private AuditService auditService;
    @MockBean private AiModelClient model;
    @MockBean private QdrantClient qdrant;
    @MockBean private PaperStandardService paperStandardService;
    @MockBean private PaperProcessingServiceImpl paperProcessingService;

    @Test
    void unshareAndReferenceAddNeverLeaveAnInvisibleReference() throws Exception {
        for (int iteration = 0; iteration < 20; iteration++) {
            Fixture fixture = fixture();
            List<String> outcomes = race(fixture);

            boolean shared = projectDocumentExists(fixture.projectId(), fixture.sourceId());
            boolean referenced = paperReferenceExists(fixture.paperId(), fixture.sourceId());
            assertThat(!referenced || shared)
                    .as("iteration %s outcomes=%s shared=%s referenced=%s", iteration, outcomes, shared, referenced)
                    .isTrue();
            assertThat(outcomes).containsAnyOf("REFERENCE_ADDED", "SOURCE_UNSHARED", "BLOCKED");
            cleanup(fixture);
        }
    }

    private List<String> race(Fixture fixture) throws Exception {
        CountDownLatch start = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var unlink = pool.submit(() -> unshareAfterStart(fixture, start));
            var add = pool.submit(() -> addAfterStart(fixture, start));
            start.countDown();
            return List.of(unlink.get(20, TimeUnit.SECONDS), add.get(20, TimeUnit.SECONDS));
        }
    }

    private String unshareAfterStart(Fixture fixture, CountDownLatch start) throws Exception {
        login(fixture.instructor());
        try {
            assertThat(start.await(5, TimeUnit.SECONDS)).isTrue();
            return unshare.unshare(fixture.projectId(), List.of(fixture.sourceId())).removedSourceIds().isEmpty()
                    ? "BLOCKED" : "SOURCE_UNSHARED";
        } catch (ResponseStatusException | ResourceNotFoundException error) {
            return "BLOCKED";
        } finally {
            SecurityContextHolder.clearContext();
        }
    }

    private String addAfterStart(Fixture fixture, CountDownLatch start) throws Exception {
        try {
            assertThat(start.await(5, TimeUnit.SECONDS)).isTrue();
            references.add(fixture.paperId(), fixture.sourceId(), fixture.leader().getId());
            return "REFERENCE_ADDED";
        } catch (ResponseStatusException | ResourceNotFoundException error) {
            return "BLOCKED";
        } finally {
            SecurityContextHolder.clearContext();
        }
    }

    private Fixture fixture() {
        User leader = user(UserRole.STUDENT);
        User instructor = user(UserRole.INSTRUCTOR);
        UUID projectId = UUID.randomUUID();
        UUID paperId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        jdbc.update("INSERT INTO projects(id,title,status,active) VALUES(UUID_TO_BIN(?),'Concurrency', 'IN_PROGRESS', TRUE)",
                projectId.toString());
        membership(projectId, leader.getId(), "LEADER");
        membership(projectId, instructor.getId(), "INSTRUCTOR");
        document(paperId, projectId, leader.getId(), "PAPER");
        document(sourceId, null, leader.getId(), "SOURCE");
        jdbc.update("INSERT INTO project_documents(id,project_id,document_id,shared_by) VALUES(UUID_TO_BIN(?),UUID_TO_BIN(?),UUID_TO_BIN(?),UUID_TO_BIN(?))",
                UUID.randomUUID().toString(), projectId.toString(), sourceId.toString(), instructor.getId().toString());
        return new Fixture(projectId, paperId, sourceId, leader, instructor);
    }

    private void cleanup(Fixture fixture) {
        jdbc.update("DELETE FROM paper_references WHERE paper_id=UUID_TO_BIN(?) OR source_id=UUID_TO_BIN(?)",
                fixture.paperId().toString(), fixture.sourceId().toString());
        jdbc.update("DELETE FROM project_documents WHERE project_id=UUID_TO_BIN(?)", fixture.projectId().toString());
        jdbc.update("DELETE FROM documents WHERE id IN(UUID_TO_BIN(?),UUID_TO_BIN(?))",
                fixture.paperId().toString(), fixture.sourceId().toString());
        jdbc.update("DELETE FROM project_members WHERE project_id=UUID_TO_BIN(?)", fixture.projectId().toString());
        jdbc.update("DELETE FROM projects WHERE id=UUID_TO_BIN(?)", fixture.projectId().toString());
        jdbc.update("DELETE FROM users WHERE id IN(UUID_TO_BIN(?),UUID_TO_BIN(?))",
                fixture.leader().getId().toString(), fixture.instructor().getId().toString());
    }

    private boolean projectDocumentExists(UUID projectId, UUID sourceId) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM project_documents WHERE project_id=UUID_TO_BIN(?) AND document_id=UUID_TO_BIN(?)",
                Integer.class, projectId.toString(), sourceId.toString()) > 0;
    }

    private boolean paperReferenceExists(UUID paperId, UUID sourceId) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM paper_references WHERE paper_id=UUID_TO_BIN(?) AND source_id=UUID_TO_BIN(?)",
                Integer.class, paperId.toString(), sourceId.toString()) > 0;
    }

    private User user(UserRole role) {
        User user = new User();
        user.setId(UUID.randomUUID());
        user.setEmail(user.getId() + "@example.test");
        user.setRole(role);
        user.setAccountStatus(AccountStatus.ACTIVE);
        jdbc.update("INSERT INTO users(id,email,password_hash,role,account_status) VALUES(UUID_TO_BIN(?),?,'hash',?,'ACTIVE')",
                user.getId().toString(), user.getEmail(), role.name());
        return user;
    }

    private void membership(UUID projectId, UUID userId, String role) {
        jdbc.update("INSERT INTO project_members(id,project_id,user_id,role) VALUES(UUID_TO_BIN(?),UUID_TO_BIN(?),UUID_TO_BIN(?),?)",
                UUID.randomUUID().toString(), projectId.toString(), userId.toString(), role);
    }

    private void document(UUID documentId, UUID projectId, UUID uploaderId, String type) {
        jdbc.update("INSERT INTO documents(id,project_id,uploaded_by,doc_type,file_url,processing_status,active,download_token) VALUES(UUID_TO_BIN(?),UUID_TO_BIN(?),UUID_TO_BIN(?),?,'fixture.pdf','READY',TRUE,UUID())",
                documentId.toString(), projectId == null ? null : projectId.toString(), uploaderId.toString(), type);
    }

    private void login(User user) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(user, null, List.of()));
    }

    private record Fixture(UUID projectId, UUID paperId, UUID sourceId, User leader, User instructor) { }
}
