package com.evidencepilot.model.enums;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import org.junit.jupiter.api.Test;

class ProcessingStatusSchemaTest {

    @Test
    void documentsProcessingStatusCheckAllowsEveryStatus() throws IOException {
        try (var schema = getClass().getResourceAsStream("/db/migration/V1__baseline_schema.sql")) {
            String processingStatusConstraint = new String(schema.readAllBytes(), StandardCharsets.UTF_8)
                    .lines()
                    .filter(line -> line.contains("processing_status"))
                    .findFirst()
                    .orElseThrow();

            assertThat(processingStatusConstraint).contains(
                    Arrays.stream(ProcessingStatus.values()).map(Enum::name).toArray(String[]::new));
        }
    }
}
