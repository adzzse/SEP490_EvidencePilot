package com.evidencepilot.migration;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationVersion;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Testcontainers(disabledWithoutDocker = true)
@DataJpaTest(properties = {
        "spring.flyway.enabled=true",
        "spring.jpa.hibernate.ddl-auto=validate",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.MySQLDialect"
})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class FlywayMigrationMySqlTest {

    private static final String REHEARSAL_DATABASE = "existing_schema_rehearsal";

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

    @Test
    void migrationsBuildValidatedSchemaAndEnforceCoreInvariants() {
        Integer successfulMigrations = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM flyway_schema_history WHERE success = 1",
                Integer.class);
        assertThat(successfulMigrations).isEqualTo(12);

        assertThat(jdbcTemplate.queryForList("""
                        SELECT constraint_name
                        FROM information_schema.table_constraints
                        WHERE constraint_schema = DATABASE()
                        """, String.class))
                .contains(
                        "uq_document_chunks_document_index",
                        "uq_review_snapshots_lookup",
                        "uq_project_media_storage",
                        "uq_document_references_order",
                        "chk_document_references_edge_type",
                        "chk_export_jobs_status",
                        "uq_evidence_revision_traces_round_finding",
                        "chk_evidence_revision_traces_student_action",
                        "chk_evidence_revision_traces_ai_recheck_judgment");

        assertThat(jdbcTemplate.queryForList(
                "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()",
                String.class))
                .contains("citation_review_rounds", "evidence_revision_traces");
        assertThat(jdbcTemplate.queryForList("""
                        SELECT column_name
                        FROM information_schema.columns
                        WHERE table_schema = DATABASE()
                          AND table_name = 'ai_evaluation_jobs'
                        """, String.class))
                .contains("progress_current", "progress_total");

        assertThat(jdbcTemplate.queryForMap(
                "SELECT data_type FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'citation_review_rounds' AND column_name = 'generation_meta'"))
                .containsEntry("data_type", "json");
        assertThat(jdbcTemplate.queryForList("""
                        SELECT column_name
                        FROM information_schema.columns
                        WHERE table_schema = DATABASE()
                          AND table_name = 'evidence_revision_traces'
                        """, String.class))
                .contains("ai_recheck_judgment", "ai_recheck_reason", "ai_rechecked_at", "round_duration_ms")
                .doesNotContain("accepted", "actual_edit_hash");

        String userId = UUID.randomUUID().toString();
        String projectId = UUID.randomUUID().toString();
        String documentId = UUID.randomUUID().toString();

        jdbcTemplate.update("""
                INSERT INTO users (id, email, password_hash, role, account_status)
                VALUES (UUID_TO_BIN(?), ?, 'hash', 'STUDENT', 'ACTIVE')
                """, userId, "migration-test@example.com");
        jdbcTemplate.update("""
                INSERT INTO users (id, email, password_hash, role, account_status, student_code)
                VALUES (UUID_TO_BIN(?), ?, 'hash', 'STUDENT', 'DELETED', ?)
                """, UUID.randomUUID().toString(), "reusable@example.com", "SE-REUSE");
        assertThatCode(() -> jdbcTemplate.update("""
                INSERT INTO users (id, email, password_hash, role, account_status, student_code)
                VALUES (UUID_TO_BIN(?), ?, 'hash', 'STUDENT', 'ACTIVE', ?)
                """, UUID.randomUUID().toString(), "reusable@example.com", "SE-REUSE"))
                .doesNotThrowAnyException();
        jdbcTemplate.update("""
                INSERT INTO projects (id, title, status, active)
                VALUES (UUID_TO_BIN(?), 'Migration Test', 'CREATED', TRUE)
                """, projectId);
        jdbcTemplate.update("""
                INSERT INTO ai_evaluation_jobs (id, project_id, kind, payload_json, status)
                VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), 'SOURCE_MATCHES', '{}', 'PENDING')
                """, UUID.randomUUID().toString(), projectId);
        jdbcTemplate.update("""
                INSERT INTO ai_evaluation_jobs (id, project_id, kind, payload_json, status)
                VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), 'TRACE_RECHECK', '{}', 'PENDING')
                """, UUID.randomUUID().toString(), projectId);
        jdbcTemplate.update("""
                INSERT INTO documents (
                    id, project_id, uploaded_by, doc_type, file_url,
                    processing_status, active, download_token
                ) VALUES (
                    UUID_TO_BIN(?), UUID_TO_BIN(?), UUID_TO_BIN(?), 'SOURCE', 'test.pdf',
                    'READY', TRUE, UUID()
                )
                """, documentId, projectId, userId);
        jdbcTemplate.update("""
                INSERT INTO document_chunks (id, document_id, chunk_index, `text`, active)
                VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), 0, 'first', TRUE)
                """, UUID.randomUUID().toString(), documentId);

        assertThatThrownBy(() -> jdbcTemplate.update("""
                        INSERT INTO document_chunks (id, document_id, chunk_index, `text`, active)
                        VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), 0, 'duplicate', TRUE)
                        """, UUID.randomUUID().toString(), documentId))
                .isInstanceOf(DataIntegrityViolationException.class);

        assertThatThrownBy(() -> jdbcTemplate.update("""
                        INSERT INTO export_jobs (id, project_id, user_id, status, format)
                        VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), UUID_TO_BIN(?), 'UNKNOWN', 'TEX')
                        """, UUID.randomUUID().toString(), projectId, userId))
                .isInstanceOf(DataAccessException.class);

        assertThatThrownBy(() -> jdbcTemplate.update(
                "UPDATE documents SET download_token = NULL WHERE id = UUID_TO_BIN(?)", documentId))
                .isInstanceOf(DataAccessException.class);
    }

    @Test
    void existingSchemaCanBeBaselinedAtVersionOneAndMigrated() {
        JdbcTemplate adminJdbcTemplate = jdbcTemplate(
                jdbcUrl("mysql"), "root", MYSQL.getPassword());
        adminJdbcTemplate.execute("CREATE DATABASE " + REHEARSAL_DATABASE);

        JdbcTemplate rehearsalJdbcTemplate = jdbcTemplate(
                jdbcUrl(REHEARSAL_DATABASE), "root", MYSQL.getPassword());

        Flyway.configure()
                .dataSource(rehearsalJdbcTemplate.getDataSource())
                .target(MigrationVersion.fromVersion("1"))
                .load()
                .migrate();
        rehearsalJdbcTemplate.execute("DROP TABLE flyway_schema_history");

        String userId = UUID.randomUUID().toString();
        String projectId = UUID.randomUUID().toString();
        String collectionId = UUID.randomUUID().toString();
        String documentId = UUID.randomUUID().toString();
        rehearsalJdbcTemplate.update("""
                INSERT INTO users (id, email, password_hash, role, account_status)
                VALUES (UUID_TO_BIN(?), ?, 'hash', 'INSTRUCTOR', 'ACTIVE')
                """, userId, "baseline-test@example.com");
        rehearsalJdbcTemplate.update("""
                INSERT INTO projects (id, title, status, active)
                VALUES (UUID_TO_BIN(?), 'Baseline Test', 'CREATED', TRUE)
                """, projectId);
        rehearsalJdbcTemplate.update("""
                INSERT INTO collections (id, instructor_id, title, active)
                VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), 'Legacy Collection', NULL)
                """, collectionId, userId);
        rehearsalJdbcTemplate.update("""
                INSERT INTO documents (
                    id, project_id, uploaded_by, doc_type, file_url, processing_status, active, download_token
                ) VALUES (
                    UUID_TO_BIN(?), UUID_TO_BIN(?), UUID_TO_BIN(?), 'SOURCE', 'legacy.pdf', 'READY', TRUE, NULL
                )
                """, documentId, projectId, userId);
        rehearsalJdbcTemplate.update("""
                INSERT INTO document_references (id, document_id, reference_index, raw_text, edge_type)
                VALUES
                    (UUID_TO_BIN(?), UUID_TO_BIN(?), 0, 'legacy-ref-a', NULL),
                    (UUID_TO_BIN(?), UUID_TO_BIN(?), 0, 'legacy-ref-b', 'REFERENCES')
                """, UUID.randomUUID().toString(), documentId,
                UUID.randomUUID().toString(), documentId);

        int migrationsExecuted = Flyway.configure()
                .dataSource(rehearsalJdbcTemplate.getDataSource())
                .baselineOnMigrate(true)
                .baselineVersion(MigrationVersion.fromVersion("1"))
                .load()
                .migrate()
                .migrationsExecuted;

        assertThat(migrationsExecuted).isEqualTo(11);
        assertThat(rehearsalJdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM flyway_schema_history WHERE success = 1",
                Integer.class)).isEqualTo(12);
        assertThat(rehearsalJdbcTemplate.queryForObject(
                "SELECT type FROM flyway_schema_history WHERE installed_rank = 1",
                String.class)).isEqualTo("BASELINE");
        assertThat(rehearsalJdbcTemplate.queryForObject(
                "SELECT active FROM collections WHERE id = UUID_TO_BIN(?)",
                Boolean.class, collectionId)).isTrue();
        assertThat(rehearsalJdbcTemplate.queryForObject(
                "SELECT download_token FROM documents WHERE id = UUID_TO_BIN(?)",
                String.class, documentId)).isNotBlank();
        assertThat(rehearsalJdbcTemplate.queryForList(
                "SELECT edge_type FROM document_references WHERE document_id = UUID_TO_BIN(?)",
                String.class, documentId)).containsOnly("REFERENCES");
        assertThat(rehearsalJdbcTemplate.queryForList(
                "SELECT reference_index FROM document_references WHERE document_id = UUID_TO_BIN(?) ORDER BY reference_index",
                Integer.class, documentId)).containsExactly(0, 1);
        assertThat(rehearsalJdbcTemplate.queryForList("""
                        SELECT constraint_name
                        FROM information_schema.table_constraints
                        WHERE constraint_schema = DATABASE()
                        """, String.class))
                .contains(
                        "uq_document_chunks_document_index",
                        "uq_review_snapshots_lookup",
                        "uq_project_media_storage",
                        "uq_document_references_order");
    }

    private static JdbcTemplate jdbcTemplate(String url, String username, String password) {
        return new JdbcTemplate(new DriverManagerDataSource(url, username, password));
    }

    private static String jdbcUrl(String database) {
        return "jdbc:mysql://%s:%d/%s".formatted(
                MYSQL.getHost(), MYSQL.getMappedPort(MySQLContainer.MYSQL_PORT), database);
    }
}
