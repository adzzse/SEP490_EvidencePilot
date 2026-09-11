package com.evidencepilot.service;

import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.io.InputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * Permanent guard: the synthetic classpath fixture must pass the real
 * AdminExcelSeedService dry-run validation with zero errors.
 */
class Seed2FixtureValidationTest {

    private static AdminExcelSeedService service() {
        return new AdminExcelSeedService(
                mock(AdminService.class),
                mock(com.evidencepilot.repository.UserRepository.class),
                mock(com.evidencepilot.repository.ProjectRepository.class),
                mock(com.evidencepilot.repository.ProjectMemberRepository.class),
                mock(com.evidencepilot.repository.DocumentRepository.class),
                mock(com.evidencepilot.repository.DocumentTextRepository.class),
                mock(com.evidencepilot.repository.DocumentChunkRepository.class),
                mock(com.evidencepilot.repository.PaperSectionRepository.class),
                mock(DocumentService.class),
                mock(MediaAssetService.class),
                mock(PaperProcessingService.class),
                mock(com.evidencepilot.client.openalex.OpenAlexClient.class),
                mock(com.evidencepilot.service.OpenAlexIngestionService.class),
                mock(DocumentObjectStorage.class),
                mock(com.evidencepilot.service.impl.DocumentPersistenceService.class),
                mock(com.evidencepilot.service.impl.ProjectCollectionService.class),
                mock(com.fasterxml.jackson.databind.ObjectMapper.class),
                new DevBypassPolicy(true, new org.springframework.mock.env.MockEnvironment()
                        .withProperty("spring.profiles.active", "test")),
                mock(org.springframework.transaction.PlatformTransactionManager.class));
    }

    @Test
    void seed2PassesDryRunValidation() throws Exception {
        AdminExcelSeedService.ParsedSeed parsed;
        try (InputStream resource = getClass().getResourceAsStream("/seed/seed-minimal.xlsx")) {
            assertThat(resource).isNotNull();
            byte[] bytes;
            bytes = resource.readAllBytes();
            try (InputStream in = new ByteArrayInputStream(bytes)) {
                parsed = service().parse(in, bytes.length);
            }
        }
        assertThat(parsed.errors()).as(String.join("; ", parsed.errors())).isEmpty();
        assertThat(parsed.sheets()).containsOnlyKeys("users", "projects", "members", "sources", "papers");
        assertThat(parsed.sheets().get("users")).hasSize(2);
        assertThat(parsed.sheets().get("projects")).hasSize(2);
        assertThat(parsed.sheets().get("members")).hasSize(4);
        assertThat(parsed.sheets().get("sources")).hasSize(1);
        assertThat(parsed.sheets().get("papers")).hasSize(2);
    }
}
