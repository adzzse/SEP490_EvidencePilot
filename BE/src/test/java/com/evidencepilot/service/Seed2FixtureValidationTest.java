package com.evidencepilot.service;

import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.io.FileInputStream;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

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
    @Disabled("seed.xlsx fixture not committed to repo — run locally with file present")
    void seed2PassesDryRunValidation() throws Exception {
        // ponytail: classpath lookup first — relative Paths break when
        // surefire's working directory shifts depending on which tests ran.
        AdminExcelSeedService.ParsedSeed parsed;
        InputStream resource = getClass().getResourceAsStream("/DataDemo/seed.xlsx");
        if (resource != null) {
            byte[] bytes;
            try (InputStream in = resource) {
                bytes = in.readAllBytes();
            }
            try (InputStream in = new ByteArrayInputStream(bytes)) {
                parsed = service().parse(in, bytes.length);
            }
        } else {
            Path file = Paths.get("src/main/resources/DataDemo/seed.xlsx");
            if (!Files.exists(file)) {
                file = Paths.get("BE/src/main/resources/DataDemo/seed.xlsx");
            }
            try (InputStream in = new FileInputStream(file.toFile())) {
                parsed = service().parse(in, Files.size(file));
            }
        }
        assertThat(parsed.errors()).as(String.join("; ", parsed.errors())).isEmpty();
        assertThat(parsed.sheets().get("users")).hasSize(31);
        assertThat(parsed.sheets().get("projects")).hasSize(62);
        assertThat(parsed.sheets().get("members")).hasSize(262);
        assertThat(parsed.sheets().get("sources")).hasSize(60);
        assertThat(parsed.sheets().get("papers")).hasSize(62);
        assertThat(parsed.sheets().get("collections")).hasSize(33);
        assertThat(parsed.sheets()).doesNotContainKey("sections");
    }
}
