package db.migration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.sql.Timestamp;
import java.util.UUID;

/**
 * Seeds {@code review_section_snapshots} (BASELINE) from legacy
 * {@code feedback_requests.submission_snapshot_json} blobs (schema v1/v2).
 * Per-row isolation: one malformed JSON never aborts the flight.
 * Lives in db.migration so Flyway discovers it via classpath scanning
 * (both Spring Boot and plain Flyway.configure()).
 */
public class V37_1__SeedReviewSnapshots extends BaseJavaMigration {

    private static final Logger log = LoggerFactory.getLogger(V37_1__SeedReviewSnapshots.class);

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public void migrate(Context context) throws Exception {
        int seeded = 0;
        int skipped = 0;
        try (Statement select = context.getConnection().createStatement();
             ResultSet rows = select.executeQuery(
                     "SELECT BIN_TO_UUID(id) AS rid, submission_snapshot_json, requested_at"
                             + " FROM feedback_requests"
                             + " WHERE submission_snapshot_json IS NOT NULL"
                             + " AND TRIM(submission_snapshot_json) <> ''")) {
            while (rows.next()) {
                String requestId = rows.getString("rid");
                String json = rows.getString("submission_snapshot_json");
                Timestamp requestedAt = rows.getTimestamp("requested_at");
                try {
                    seeded += seedRequest(context, requestId, json, requestedAt);
                } catch (Exception exception) {
                    skipped += 1;
                    log.warn("Skipping unparseable submission snapshot for request {}: {}",
                            requestId, exception.toString());
                }
            }
        }
        log.info("Seeded {} review_section_snapshots BASELINE rows, skipped {} requests.", seeded, skipped);
    }

    private int seedRequest(Context context, String requestId, String json, Timestamp requestedAt) throws Exception {
        JsonNode root = objectMapper.readTree(json);
        int schemaVersion = root.path("schemaVersion").asInt(-1);
        if (schemaVersion != 1 && schemaVersion != 2) throw new IllegalArgumentException("Unknown schemaVersion");
        JsonNode papers = root.path("papers");
        if (!papers.isArray() || papers.isEmpty()) throw new IllegalArgumentException("No papers");
        int count = 0;
        try (PreparedStatement insert = context.getConnection().prepareStatement(
                "INSERT IGNORE INTO review_section_snapshots"
                        + " (id, request_id, section_id, content_tex, content_version, snapshot_type, created_at)"
                        + " VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), UUID_TO_BIN(?), ?, ?, 'BASELINE', ?)")) {
            for (JsonNode paper : papers) {
                JsonNode sections = paper.path("sections");
                if (!sections.isArray()) continue;
                for (JsonNode section : sections) {
                    String sectionId = section.path("id").asText(null);
                    JsonNode contentTex = section.path("contentTex");
                    if (sectionId == null || !contentTex.isTextual()) continue;
                    UUID.fromString(sectionId);
                    UUID.fromString(requestId);
                    insert.setString(1, UUID.randomUUID().toString());
                    insert.setString(2, requestId);
                    insert.setString(3, sectionId);
                    insert.setString(4, contentTex.asText());
                    if (section.path("contentVersion").isIntegralNumber()) {
                        insert.setInt(5, section.path("contentVersion").asInt());
                    } else {
                        insert.setNull(5, java.sql.Types.INTEGER);
                    }
                    insert.setTimestamp(6, requestedAt);
                    insert.addBatch();
                    count += 1;
                }
            }
            insert.executeBatch();
        }
        return count;
    }
}
