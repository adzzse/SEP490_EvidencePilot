package com.evidencepilot.service;

import com.evidencepilot.repository.AiGenerationConfigRepository;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

class AiGenerationConfigServiceTest {
    @Test void largerCatalogStillLimitsTheSelectedChainToThree() {
        var service = new AiGenerationConfigService(mock(AiGenerationConfigRepository.class),
                mock(AuditService.class));
        var catalog = new AiModelClient.GenerationCatalog(1, "remote",
                List.of("model-a", "model-b", "model-c", "model-d", "model-e"),
                List.of("model-a"), "a".repeat(64), 8000, 48000);

        assertThat(service.candidate(catalog, List.of("model-e")).modelIds())
                .containsExactly("model-e");
        assertThatThrownBy(() -> service.candidate(catalog,
                List.of("model-a", "model-b", "model-c", "model-d")))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
