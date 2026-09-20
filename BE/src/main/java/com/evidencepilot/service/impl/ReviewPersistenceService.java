package com.evidencepilot.service.impl;

import com.evidencepilot.dto.response.SectionCitationReviewResponse;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.ReviewSnapshot;
import com.evidencepilot.repository.ReviewSnapshotRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Transactional persistence for citation-review snapshots.
 *
 * <p>Separated from {@link SectionCitationReviewService} so the multi-minute AI
 * loop can run without holding a database transaction: every method here is a
 * short, self-contained transaction while the AI work happens outside of any.
 */
@Service
@RequiredArgsConstructor
public class ReviewPersistenceService {

    public static final String BATCH_STYLE_SUFFIX = ":batch:";

    private final ReviewSnapshotRepository reviewSnapshotRepository;
    private final ObjectMapper objectMapper;

    @Transactional
    public void saveFinalSnapshot(
            Project project, String fingerprint, SectionCitationReviewResponse review) {
        saveSnapshot(project, SectionCitationReviewService.REVIEW_VERSION, fingerprint, review);
        if (!review.complete()) {
            // rationale: a partial final must NOT wipe batch rows — they are the
            // resume source for re-clicks and the merge source for cached().
            return;
        }
        // Batch rows served resume/refresh while running; a complete final supersedes them.
        reviewSnapshotRepository.findByProjectIdAndInputFingerprint(project.getId(), fingerprint)
                .stream()
                .filter(row -> row.getStyle() != null
                        && row.getStyle().startsWith(
                                SectionCitationReviewService.REVIEW_VERSION + BATCH_STYLE_SUFFIX))
                .forEach(row -> reviewSnapshotRepository
                        .deleteByProjectIdAndStyleAndInputFingerprint(
                                project.getId(), row.getStyle(), fingerprint));
    }

    @Transactional
    public void saveBatchSnapshot(
            Project project, String fingerprint, int batchIndex, SectionCitationReviewResponse batchResult) {
        saveSnapshot(project,
                SectionCitationReviewService.REVIEW_VERSION + BATCH_STYLE_SUFFIX + batchIndex,
                fingerprint, batchResult);
    }

    @Transactional(readOnly = true)
    public Map<Integer, SectionCitationReviewResponse> loadBatchSnapshots(
            UUID projectId, String fingerprint) {
        String prefix = SectionCitationReviewService.REVIEW_VERSION + BATCH_STYLE_SUFFIX;
        Map<Integer, SectionCitationReviewResponse> batches = new LinkedHashMap<>();
        for (ReviewSnapshot row : reviewSnapshotRepository
                .findByProjectIdAndInputFingerprint(projectId, fingerprint)) {
            if (row.getStyle() == null || !row.getStyle().startsWith(prefix)) {
                continue;
            }
            try {
                int batchIndex = Integer.parseInt(row.getStyle().substring(prefix.length()));
                readSnapshot(row).ifPresent(response -> batches.put(batchIndex, response));
            } catch (NumberFormatException | NullPointerException ignored) {
                // rationale: skip malformed batch rows — worst case the batch re-runs.
            }
        }
        return batches;
    }

    private void saveSnapshot(
            Project project, String style, String fingerprint, SectionCitationReviewResponse review) {
        ReviewSnapshot snapshot = reviewSnapshotRepository
                .findByProjectIdAndStyleAndInputFingerprint(project.getId(), style, fingerprint)
                .orElseGet(ReviewSnapshot::new);
        snapshot.setProject(project);
        snapshot.setStyle(style);
        snapshot.setInputFingerprint(fingerprint);
        snapshot.setCreatedAt(LocalDateTime.now());
        try {
            snapshot.setResponseJson(objectMapper.writeValueAsString(review));
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Could not serialize section review", exception);
        }
        reviewSnapshotRepository.save(snapshot);
    }

    private Optional<SectionCitationReviewResponse> readSnapshot(ReviewSnapshot snapshot) {
        try {
            return Optional.of(objectMapper.readValue(
                    snapshot.getResponseJson(), SectionCitationReviewResponse.class));
        } catch (JsonProcessingException exception) {
            return Optional.empty();
        }
    }
}
