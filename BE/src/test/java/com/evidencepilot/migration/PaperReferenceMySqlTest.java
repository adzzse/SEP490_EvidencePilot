package com.evidencepilot.migration;

import org.junit.jupiter.api.Test;
import org.flywaydb.core.Flyway;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Verifies the paper_references table, its constraints, and the V33 backfill
 * shape: one row per valid (paper, source), no outsider row, manual
 * bibliography text preserved. Fixtures are kept after the test.
 */
@Testcontainers(disabledWithoutDocker = true)
@DataJpaTest(properties = {
        "spring.flyway.enabled=true",
        "spring.jpa.hibernate.ddl-auto=validate",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.MySQLDialect"
})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class PaperReferenceMySqlTest {

    @Container
    private static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.0.46");

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", MYSQL::getJdbcUrl);
        registry.add("spring.datasource.username", MYSQL::getUsername);
        registry.add("spring.datasource.password", MYSQL::getPassword);
        registry.add("spring.datasource.driver-class-name", MYSQL::getDriverClassName);
    }

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private static String key(UUID id) {
        return "ep" + id.toString().replace("-", "");
    }

    @Test
    void backfillRegistersOnlyProjectVisibleSourcesAndPreservesManualText() {
        String schema = "paper_ref_" + UUID.randomUUID().toString().replace("-", "");
        var rootJdbc = new JdbcTemplate(new DriverManagerDataSource(MYSQL.getJdbcUrl(), "root", MYSQL.getPassword()));
        rootJdbc.execute("CREATE DATABASE " + schema);
        var dataSource = new DriverManagerDataSource(
                MYSQL.getJdbcUrl().replace("/" + MYSQL.getDatabaseName(), "/" + schema),
                "root", MYSQL.getPassword());
        var jdbcTemplate = new JdbcTemplate(dataSource);
        Flyway.configure().dataSource(dataSource).target("32").load().migrate();

        String userId = UUID.randomUUID().toString();
        String projectId = UUID.randomUUID().toString();
        String otherProjectId = UUID.randomUUID().toString();
        String paperId = UUID.randomUUID().toString();
        UUID readyId = UUID.randomUUID();
        UUID metadataOnlyId = UUID.randomUUID();
        UUID outsiderId = UUID.randomUUID();
        UUID proseOnlyId = UUID.randomUUID();
        jdbcTemplate.update(
                "INSERT INTO users (id, email, password_hash, role, account_status) VALUES (UUID_TO_BIN(?), ?, 'hash', 'STUDENT', 'ACTIVE')",
                userId, "paper-ref-" + userId.substring(0, 8) + "@example.com");
        jdbcTemplate.update(
                "INSERT INTO projects (id, title, status, active) VALUES (UUID_TO_BIN(?), 'Paper Ref', 'ASSIGNED', TRUE)",
                projectId);
        jdbcTemplate.update(
                "INSERT INTO projects (id, title, status, active) VALUES (UUID_TO_BIN(?), 'Other', 'ASSIGNED', TRUE)",
                otherProjectId);
        insertSource(jdbcTemplate, readyId, projectId, userId, "READY");
        insertSource(jdbcTemplate, metadataOnlyId, projectId, userId, "METADATA_FETCHED");
        insertSource(jdbcTemplate, outsiderId, otherProjectId, userId, "READY");
        insertSource(jdbcTemplate, proseOnlyId, projectId, userId, "READY");
        jdbcTemplate.update(
                "INSERT INTO documents (id, project_id, uploaded_by, doc_type, file_url, processing_status, active, download_token)"
                        + " VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), UUID_TO_BIN(?), 'PAPER', 'paper.pdf', 'READY', TRUE, UUID())",
                paperId, projectId, userId);

        String manualText = "\\bibitem{" + key(proseOnlyId) + "} Manual entry\n\\bibliography{refs}";
        String sectionOne = "First \\cite{" + key(readyId) + "} and again \\cite{" + key(readyId) + "} plus \\cite{" + key(metadataOnlyId) + "}";
        String sectionTwo = "Again \\cite[p. 2]{manual-key, " + key(readyId) + "} outsider \\cite{" + key(outsiderId) + "} bad \\cite{epZZZ} prose " + key(proseOnlyId) + " " + manualText
                + "\n% Commented \\cite{" + key(proseOnlyId) + "}\nEscaped \\% keeps \\cite{" + key(readyId) + "}";
        jdbcTemplate.update(
                "INSERT INTO paper_sections (id, document_id, section_order, section_title, content_tex, active)"
                        + " VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), 0, 'Intro', ?, TRUE)",
                UUID.randomUUID().toString(), paperId, sectionOne);
        jdbcTemplate.update(
                "INSERT INTO paper_sections (id, document_id, section_order, section_title, content_tex, active)"
                        + " VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), 1, 'References', ?, TRUE)",
                UUID.randomUUID().toString(), paperId, sectionTwo);

        Flyway.configure().dataSource(dataSource).load().migrate();
        int inserted = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM paper_references", Integer.class);
        assertThat(inserted).isEqualTo(2);

        assertThat(jdbcTemplate.queryForList(
                "SELECT LOWER(BIN_TO_UUID(source_id)) FROM paper_references WHERE paper_id = UUID_TO_BIN(?)",
                String.class, paperId))
                .containsExactlyInAnyOrder(readyId.toString(), metadataOnlyId.toString());
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM paper_references WHERE source_id = UUID_TO_BIN(?)",
                Integer.class, outsiderId.toString())).isZero();
        assertThat(jdbcTemplate.queryForList(
                "SELECT content_tex FROM paper_sections WHERE document_id = UUID_TO_BIN(?) ORDER BY section_order",
                String.class, paperId)).containsExactly(sectionOne, sectionTwo);

        assertThatThrownBy(() -> jdbcTemplate.update(
                "INSERT INTO paper_references (id, paper_id, source_id, added_by, added_at)"
                        + " VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), UUID_TO_BIN(?), UUID_TO_BIN(?), CURRENT_TIMESTAMP(6))",
                UUID.randomUUID().toString(), paperId, readyId.toString(), userId))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbcTemplate.update(
                "INSERT INTO paper_references (id, paper_id, source_id, added_by, added_at)"
                        + " VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), UUID_TO_BIN(?), UUID_TO_BIN(?), CURRENT_TIMESTAMP(6))",
                UUID.randomUUID().toString(), UUID.randomUUID().toString(), readyId.toString(), userId))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    private void insertSource(JdbcTemplate jdbcTemplate, UUID id, String projectId, String userId, String status) {
        jdbcTemplate.update(
                "INSERT INTO documents (id, project_id, uploaded_by, doc_type, file_url, processing_status, active, download_token)"
                        + " VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), UUID_TO_BIN(?), 'SOURCE', 'source.pdf', ?, TRUE, UUID())",
                id.toString(), projectId, userId, status);
    }
}
