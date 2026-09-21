package com.evidencepilot.service;

import com.evidencepilot.dto.ExtractionResultPayload;
import com.evidencepilot.dto.SparseVector;
import com.evidencepilot.model.enums.ExtractionCandidateStatus;
import com.evidencepilot.model.enums.ProcessingStatus;
import com.evidencepilot.service.impl.DocumentPersistenceService;
import com.evidencepilot.service.impl.ExtractionCandidateService;
import com.evidencepilot.service.impl.PaperProcessingServiceImpl;
import com.evidencepilot.service.impl.QdrantServiceImpl;
import com.evidencepilot.service.impl.SectionWorkHistoryService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@Testcontainers(disabledWithoutDocker = true)
@DataJpaTest(properties = {
        "spring.flyway.enabled=true", "spring.jpa.hibernate.ddl-auto=validate",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.MySQLDialect"
}, showSql = false)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@Import({ExtractionCandidateService.class, DocumentPersistenceService.class,
        QdrantServiceImpl.class, SectionWorkHistoryService.class,
        ExtractionCandidateActivationMySqlTest.JsonConfig.class})
class ExtractionCandidateActivationMySqlTest {

    @Container
    private static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.0.46");

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", MYSQL::getJdbcUrl);
        registry.add("spring.datasource.username", MYSQL::getUsername);
        registry.add("spring.datasource.password", MYSQL::getPassword);
        registry.add("spring.datasource.driver-class-name", MYSQL::getDriverClassName);
    }

    @TestConfiguration
    static class JsonConfig {
        @Bean ObjectMapper objectMapper() {
            return new ObjectMapper().findAndRegisterModules();
        }
    }

    @Autowired private JdbcTemplate jdbc;
    @Autowired private ObjectMapper json;
    @Autowired private ExtractionCandidateService candidates;
    @MockBean private QdrantClient qdrantClient;
    @MockBean private PaperProcessingServiceImpl paperProcessingService;
    @MockBean private AuditService auditService;
    @MockBean private SystemNotificationService notifications;

    @Test
    void qdrantFailureRestoresOldChunksAndCleansOnlyStagedPointIds() throws Exception {
        Fixture fixture = fixture();
        doNothing().doThrow(new IllegalStateException("Qdrant unavailable"))
                .when(qdrantClient).upsertVector(any(), anyList(), any(), any());

        assertThatThrownBy(() -> candidates.activate(fixture.candidateId()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Qdrant unavailable");

        assertThat(activeChunkIds(fixture.documentId())).containsExactly(fixture.oldChunkId());
        assertThat(candidateStatus(fixture.candidateId())).isEqualTo(ExtractionCandidateStatus.READY.name());
        verify(qdrantClient, never()).deleteByDocumentId(fixture.documentId().toString());
        verify(qdrantClient).deleteByChunkIds(argThat(ids -> ids.size() == 2
                && !ids.contains(fixture.oldChunkId().toString())));
    }

    private Fixture fixture() throws Exception {
        UUID ownerId = UUID.randomUUID();
        UUID documentId = UUID.randomUUID();
        UUID oldChunkId = UUID.randomUUID();
        UUID candidateId = UUID.randomUUID();
        jdbc.update("INSERT INTO users(id,email,password_hash,role,account_status) VALUES(UUID_TO_BIN(?),?,'hash','STUDENT','ACTIVE')",
                ownerId.toString(), ownerId + "@example.test");
        jdbc.update("""
                INSERT INTO documents(id,uploaded_by,doc_type,file_url,file_hash_sha256,processing_status,
                    chunk_count,active,download_token)
                VALUES(UUID_TO_BIN(?),UUID_TO_BIN(?),'SOURCE','fixture.pdf','fixture-hash','READY',1,TRUE,UUID())
                """, documentId.toString(), ownerId.toString());
        jdbc.update("INSERT INTO document_chunks(id,document_id,chunk_index,`text`,active) VALUES(UUID_TO_BIN(?),UUID_TO_BIN(?),0,'old chunk',TRUE)",
                oldChunkId.toString(), documentId.toString());

        List<ExtractionResultPayload.ChunkPayload> chunks = List.of(
                chunk("new chunk one", 0), chunk("new chunk two", 1));
        jdbc.update("""
                INSERT INTO document_extraction_candidates(
                    id,document_id,status,previous_processing_status,previous_chunk_count,
                    source_file_url,source_file_hash_sha256,extraction_method,extracted_markdown,
                    blocks_json,chunks_json,created_at)
                VALUES(UUID_TO_BIN(?),UUID_TO_BIN(?),'READY','READY',1,'fixture.pdf','fixture-hash',
                    'MINERU','new markdown','[]',?,NOW())
                """, candidateId.toString(), documentId.toString(), json.writeValueAsString(chunks));
        return new Fixture(documentId, oldChunkId, candidateId);
    }

    private ExtractionResultPayload.ChunkPayload chunk(String text, int index) {
        return new ExtractionResultPayload.ChunkPayload(UUID.randomUUID(), index, text,
                List.of(0.5f), new SparseVector(List.of(1L), List.of(1.0f)));
    }

    private List<UUID> activeChunkIds(UUID documentId) {
        return jdbc.queryForList("SELECT BIN_TO_UUID(id) FROM document_chunks WHERE document_id=UUID_TO_BIN(?) AND active=TRUE ORDER BY chunk_index",
                        String.class, documentId.toString())
                .stream().map(UUID::fromString).toList();
    }

    private String candidateStatus(UUID candidateId) {
        return jdbc.queryForObject("SELECT status FROM document_extraction_candidates WHERE id=UUID_TO_BIN(?)",
                String.class, candidateId.toString());
    }

    private record Fixture(UUID documentId, UUID oldChunkId, UUID candidateId) { }
}
