package com.evidencepilot.service;

import org.junit.jupiter.api.Test;

import java.io.FileInputStream;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * Permanent guard: the checked-in DataDemo/seed.xlsx must pass the real
 * AdminExcelSeedService dry-run validation with zero errors.
 */
class Seed2FixtureValidationTest {

    @Test
    void seed2PassesDryRunValidation() throws Exception {
        Path file = Paths.get("src/main/resources/DataDemo/seed.xlsx");
        if (!Files.exists(file)) {
            file = Paths.get("BE/src/main/resources/DataDemo/seed.xlsx");
        }
        AdminExcelSeedService service = new AdminExcelSeedService(
                mock(AdminService.class),
                mock(com.evidencepilot.repository.UserRepository.class),
                mock(com.evidencepilot.repository.ProjectRepository.class),
                mock(com.evidencepilot.repository.ProjectMemberRepository.class),
                mock(com.evidencepilot.repository.DocumentRepository.class),
                mock(com.evidencepilot.repository.DocumentTextRepository.class),
                mock(com.evidencepilot.repository.DocumentChunkRepository.class),
                mock(DocumentService.class),
                mock(MediaAssetService.class),
                mock(PaperProcessingService.class),
                mock(com.evidencepilot.client.openalex.OpenAlexClient.class),
                mock(com.evidencepilot.service.OpenAlexIngestionService.class),
                mock(DocumentObjectStorage.class),
                mock(com.evidencepilot.service.impl.DocumentPersistenceService.class),
                mock(com.evidencepilot.service.impl.ProjectCollectionService.class),
                mock(com.fasterxml.jackson.databind.ObjectMapper.class));
        AdminExcelSeedService.ParsedSeed parsed;
        try (InputStream in = new FileInputStream(file.toFile())) {
            parsed = service.parse(in, Files.size(file));
        }
        assertThat(parsed.errors()).as(String.join("; ", parsed.errors())).isEmpty();
        assertThat(parsed.sheets().get("users")).hasSize(30);
        assertThat(parsed.sheets().get("projects")).hasSize(62);
        assertThat(parsed.sheets().get("members")).hasSize(248);
        assertThat(parsed.sheets().get("sources")).hasSize(136);
        assertThat(parsed.sheets().get("papers")).hasSize(62);
        assertThat(parsed.sheets()).doesNotContainKey("sections");
    }
}
