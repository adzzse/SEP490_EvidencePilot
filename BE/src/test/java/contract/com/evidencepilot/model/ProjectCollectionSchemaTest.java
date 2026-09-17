package com.evidencepilot.model;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;

class ProjectCollectionSchemaTest {

    @Test
    void schemaDefinesCollectionSubscriptionAndDocumentProvenance() throws IOException {
        try (var schema = getClass().getResourceAsStream("/db/migration/V1__baseline_schema.sql")) {
            String sql = new String(schema.readAllBytes(), StandardCharsets.UTF_8);

            assertThat(sql)
                    .contains("CREATE TABLE project_collections")
                    .contains("UNIQUE INDEX idx_project_collections_unique (project_id, collection_id)")
                    .contains("project_collection_id BINARY(16)")
                    .contains("pinned BOOLEAN NOT NULL DEFAULT TRUE")
                    .doesNotContain("CREATE TABLE collections (\n    id BINARY(16) NOT NULL PRIMARY KEY,\n    project_id");
        }
    }
}
