package com.evidencepilot.client.openalex;

import com.evidencepilot.service.impl.SourceMatchingService;
import com.evidencepilot.service.impl.OpenAlexIngestionServiceImpl;

import com.evidencepilot.model.Document;
import com.evidencepilot.repository.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.client.RestClient;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;

/** Explicit local maintenance only. Dry run by default; apply requires an exact document allowlist. */
@EnabledIfEnvironmentVariable(named = "SOURCE_MAP_PROJECT_ID", matches = ".+")
@DataJpaTest(showSql = false, properties = {"spring.jpa.hibernate.ddl-auto=validate", "spring.flyway.enabled=false"})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class SourceMapBackfillTest {
    @Autowired DocumentRepository documents;
    @Autowired ProjectDocumentRepository mappings;
    @Autowired DocumentReferenceRepository references;
    @Autowired PlatformTransactionManager transactionManager;

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) {
        String url = System.getenv("SOURCE_MAP_DB_URL");
        if (url == null || !url.startsWith("jdbc:mysql://127.0.0.1:3307/")) {
            throw new IllegalArgumentException("Maintenance is restricted to local MySQL port 3307");
        }
        properties.add("spring.datasource.url", () -> url);
        properties.add("spring.datasource.username", () -> System.getenv("DB_USERNAME"));
        properties.add("spring.datasource.password", () -> System.getenv("DB_PASSWORD"));
        properties.add("spring.datasource.driver-class-name", () -> "com.mysql.cj.jdbc.Driver");
        properties.add("spring.jpa.properties.hibernate.dialect", () -> "org.hibernate.dialect.MySQLDialect");
    }

    @Test
    void refreshAllowlistedSources() throws Exception {
        UUID projectId = UUID.fromString(System.getenv("SOURCE_MAP_PROJECT_ID"));
        var transaction = new TransactionTemplate(transactionManager);
        var sourceMatching = new SourceMatchingService(documents, mappings, null, null, null, null);
        List<UUID> allowed = transaction.execute(status -> sourceMatching.activeSources(projectId).stream()
                .filter(source -> DoiUtils.comparisonKey(source.getDoi()) != null).map(Document::getId).sorted().toList());
        boolean apply = "true".equals(System.getenv("SOURCE_MAP_APPLY"));
        if (apply) {
            Set<UUID> requested = new HashSet<>(Arrays.stream(System.getenv("SOURCE_MAP_DOCUMENT_IDS").split(","))
                    .map(UUID::fromString).toList());
            assertThat(allowed).containsAll(requested);
            allowed = allowed.stream().filter(requested::contains).toList();
            assertThat(allowed).isNotEmpty();
        }
        var factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(10));
        factory.setReadTimeout(Duration.ofSeconds(30));
        var client = new OpenAlexClientImpl(RestClient.builder().requestFactory(factory).build(),
                "https://api.openalex.org", System.getenv("OPENALEX_API_KEY"), org.mockito.Mockito.mock(java.net.http.HttpClient.class), new ObjectMapper());
        var service = new OpenAlexIngestionServiceImpl(client, documents, null, null, null, null,
                null, null, references, new ObjectMapper(), null);
        var results = new ArrayList<Map<String, Object>>();
        for (UUID id : allowed) {
            var row = new LinkedHashMap<String, Object>();
            row.put("documentId", id);
            row.put("before", transaction.execute(status -> references.findForDocuments(List.of(id)).size()));
            try {
                if (apply) transaction.executeWithoutResult(status -> {
                    assertThat(sourceMatching.activeSources(projectId)).anyMatch(source -> source.getId().equals(id));
                    service.refreshReferences(id);
                });
                row.put("status", apply ? "REFRESHED" : "DRY_RUN");
            } catch (Exception error) {
                row.put("status", "FAILED");
                row.put("errorType", error.getClass().getSimpleName()); // Never serialize provider URLs or credentials.
            }
            row.put("after", transaction.execute(status -> references.findForDocuments(List.of(id)).size()));
            row.put("withoutDoi", transaction.execute(status -> references.findForDocuments(List.of(id)).stream()
                    .filter(reference -> DoiUtils.comparisonKey(reference.getDoi()) == null).count()));
            results.add(row);
        }
        Files.writeString(Path.of(System.getenv("SOURCE_MAP_RESULT")), new ObjectMapper().writerWithDefaultPrettyPrinter()
                .writeValueAsString(Map.of("projectId", projectId, "mode", apply ? "APPLY" : "DRY_RUN", "results", results,
                        "limitations", "Saved reference coverage only; unresolved references and cited-by limit 5 remain.")));
        assertThat(results).noneMatch(row -> "FAILED".equals(row.get("status")));
    }
}
