package com.evidencepilot.service.impl;

import com.evidencepilot.service.AiModelClient;
import com.evidencepilot.service.QdrantClient;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Testcontainers(disabledWithoutDocker = true)
@DataJpaTest(properties = {"spring.flyway.enabled=true", "spring.jpa.hibernate.ddl-auto=validate",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.MySQLDialect", "spring.jpa.show-sql=false"})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({PaperReferenceService.class, SourceMatchingService.class, SparseVectorGenerator.class, CurrentUserServiceImpl.class})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class PaperReferenceIntegrationMySqlTest {
    @Container static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.0.46");
    @DynamicPropertySource static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", MYSQL::getJdbcUrl);
        registry.add("spring.datasource.username", MYSQL::getUsername);
        registry.add("spring.datasource.password", MYSQL::getPassword);
        registry.add("spring.datasource.driver-class-name", MYSQL::getDriverClassName);
    }
    @MockBean AiModelClient model;
    @MockBean QdrantClient qdrant;
    @Autowired JdbcTemplate jdbc;
    @Autowired PaperReferenceService service;
    @Autowired SourceMatchingService matching;

    @Test
    void realDatabaseEnforcesRolesStatusVisibilityAndConcurrentIdempotence() throws Exception {
        UUID leader = user("STUDENT"), member = user("STUDENT"), instructor = user("INSTRUCTOR"), admin = user("ADMIN"), outsider = user("STUDENT");
        UUID project = UUID.randomUUID(), paper = UUID.randomUUID(), source = UUID.randomUUID();
        jdbc.update("INSERT INTO projects(id,title,status,active) VALUES(UUID_TO_BIN(?),'Paper References','ASSIGNED',TRUE)", project.toString());
        membership(project, leader, "LEADER"); membership(project, member, "MEMBER"); membership(project, instructor, "INSTRUCTOR");
        document(paper, project, leader, "PAPER"); document(source, project, leader, "SOURCE");
        var pool = Executors.newFixedThreadPool(2);
        var start = new CountDownLatch(1);
        try {
            var first = pool.submit(() -> { start.await(); return service.add(paper, source, leader); });
            var second = pool.submit(() -> { start.await(); return service.add(paper, source, member); });
            start.countDown();
            assertThat(first.get(20, TimeUnit.SECONDS).sourceId()).isEqualTo(source);
            assertThat(second.get(20, TimeUnit.SECONDS).sourceId()).isEqualTo(source);
        } finally { pool.shutdownNow(); }
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM paper_references WHERE paper_id=UUID_TO_BIN(?)", Integer.class, paper.toString())).isOne();
        assertThat(service.list(paper, instructor)).hasSize(1);
        assertThat(service.list(paper, admin)).hasSize(1);
        assertThatThrownBy(() -> service.list(paper, outsider)).isInstanceOf(ResponseStatusException.class).hasMessageContaining("403");
        assertThatThrownBy(() -> service.add(paper, source, instructor)).isInstanceOf(ResponseStatusException.class).hasMessageContaining("403");
        service.add(paper, source, admin);
        for (String status : new String[]{"SUBMITTED_FOR_REVIEW", "APPROVED", "ARCHIVED"}) {
            jdbc.update("UPDATE projects SET status=? WHERE id=UUID_TO_BIN(?)", status, project.toString());
            assertThatThrownBy(() -> service.remove(paper, source, member)).isInstanceOf(ResponseStatusException.class).hasMessageContaining("409");
        }
        jdbc.update("UPDATE projects SET status='ASSIGNED' WHERE id=UUID_TO_BIN(?)", project.toString());
        jdbc.update("UPDATE documents SET project_id=NULL WHERE id=UUID_TO_BIN(?)", source.toString());
        assertThat(service.list(paper, leader)).isEmpty();
        assertThat(matching.referenceSources(paper)).isEmpty();
        assertThat(matching.search(paper, java.util.List.of("evidence"), 5)).containsExactly(java.util.List.of());
        jdbc.update("INSERT INTO project_documents(id,project_id,document_id,shared_by) VALUES(UUID_TO_BIN(?),UUID_TO_BIN(?),UUID_TO_BIN(?),UUID_TO_BIN(?))", UUID.randomUUID().toString(),project.toString(),source.toString(),instructor.toString());
        assertThat(service.list(paper, leader)).hasSize(1);
        assertThat(matching.referenceSources(paper)).extracting(com.evidencepilot.model.Document::getId).containsExactly(source);
        jdbc.update("DELETE FROM project_documents WHERE project_id=UUID_TO_BIN(?) AND document_id=UUID_TO_BIN(?)", project.toString(),source.toString());
        assertThat(service.list(paper, leader)).isEmpty();
        assertThat(matching.retrievableReferenceSources(paper)).isEmpty();
        service.remove(paper, source, member);
    }

    private UUID user(String role) {
        UUID id=UUID.randomUUID();
        jdbc.update("INSERT INTO users(id,email,password_hash,role,account_status) VALUES(UUID_TO_BIN(?),?,'hash',?,'ACTIVE')",id.toString(),id+"@example.test",role);
        return id;
    }
    private void membership(UUID project,UUID user,String role) {
        jdbc.update("INSERT INTO project_members(id,project_id,user_id,role) VALUES(UUID_TO_BIN(?),UUID_TO_BIN(?),UUID_TO_BIN(?),?)",UUID.randomUUID().toString(),project.toString(),user.toString(),role);
    }
    private void document(UUID id,UUID project,UUID user,String type) {
        jdbc.update("INSERT INTO documents(id,project_id,uploaded_by,doc_type,file_url,processing_status,active,download_token) VALUES(UUID_TO_BIN(?),UUID_TO_BIN(?),UUID_TO_BIN(?),?,'fixture.pdf','READY',TRUE,UUID())",id.toString(),project.toString(),user.toString(),type);
    }
}
