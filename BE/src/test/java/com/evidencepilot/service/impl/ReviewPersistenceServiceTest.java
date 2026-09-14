package com.evidencepilot.service.impl;

import com.evidencepilot.dto.response.SectionCitationReviewResponse;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.ReviewSnapshot;
import com.evidencepilot.repository.ReviewSnapshotRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ReviewPersistenceServiceTest {

    private final ReviewSnapshotRepository snapshots = mock(ReviewSnapshotRepository.class);
    private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();
    private final Map<String, ReviewSnapshot> rows = new HashMap<>();

    private ReviewPersistenceService service() {
        ReviewPersistenceService service = new ReviewPersistenceService(snapshots, objectMapper);
        when(snapshots.findByProjectIdAndStyleAndInputFingerprint(
                org.mockito.ArgumentMatchers.any(), anyString(), anyString()))
                .thenAnswer(call -> Optional.ofNullable(rows.get(
                        call.getArgument(0) + "\0" + call.getArgument(1) + "\0" + call.getArgument(2))));
        when(snapshots.findByProjectIdAndInputFingerprint(
                org.mockito.ArgumentMatchers.any(), anyString()))
                .thenAnswer(call -> new ArrayList<>(rows.values()));
        org.mockito.Mockito.doAnswer(call -> {
            ReviewSnapshot row = call.getArgument(0);
            rows.put(row.getProject().getId() + "\0" + row.getStyle() + "\0" + row.getInputFingerprint(), row);
            return row;
        }).when(snapshots).save(any(ReviewSnapshot.class));
        org.mockito.Mockito.doAnswer(call -> {
            rows.remove(call.getArgument(0) + "\0" + call.getArgument(1) + "\0" + call.getArgument(2));
            return null;
        }).when(snapshots).deleteByProjectIdAndStyleAndInputFingerprint(
                org.mockito.ArgumentMatchers.any(), anyString(), anyString());
        return service;
    }

    @Test
    void batchSnapshotsRoundTripAndFinalSaveCleansThemUp() throws Exception {
        ReviewPersistenceService service = service();
        Project project = new Project();
        project.setId(UUID.randomUUID());
        String fingerprint = "fp";
        SectionCitationReviewResponse batch = batchResult(fingerprint);

        service.saveBatchSnapshot(project, fingerprint, 0, batch);

        assertThat(service.loadBatchSnapshots(project.getId(), fingerprint))
                .containsExactly(Map.entry(0, batch));

        SectionCitationReviewResponse fin = new SectionCitationReviewResponse(
                batch.reviewVersion(), batch.ruleCatalogVersion(), batch.sectionId(),
                batch.sectionVersion(), fingerprint, batch.sectionContentFingerprint(),
                LocalDateTime.now(), batch.provider(), batch.model(), true, "done",
                batch.findings(), List.of());
        service.saveFinalSnapshot(project, fingerprint, fin);

        assertThat(service.loadBatchSnapshots(project.getId(), fingerprint)).isEmpty();
        verify(snapshots).deleteByProjectIdAndStyleAndInputFingerprint(
                eq(project.getId()), eq("section-critique-v4:batch:0"), eq(fingerprint));
    }

    @Test
    void partialFinalKeepsBatchRowsForResume() {
        ReviewPersistenceService service = service();
        Project project = new Project();
        project.setId(UUID.randomUUID());
        String fingerprint = "fp";
        SectionCitationReviewResponse batch = batchResult(fingerprint);

        service.saveBatchSnapshot(project, fingerprint, 0, batch);
        service.saveFinalSnapshot(project, fingerprint, batch);

        // ponytail: complete=false — batch rows must survive for resume/refresh.
        assertThat(service.loadBatchSnapshots(project.getId(), fingerprint))
                .containsExactly(Map.entry(0, batch));
        verify(snapshots, org.mockito.Mockito.never())
                .deleteByProjectIdAndStyleAndInputFingerprint(
                        org.mockito.ArgumentMatchers.any(), anyString(), anyString());
    }

    @Test
    void loadBatchSnapshotsSkipsFinalAndMalformedRows() {
        ReviewPersistenceService service = service();
        Project project = new Project();
        project.setId(UUID.randomUUID());

        service.saveFinalSnapshot(project, "fp", batchResult("fp"));

        assertThat(service.loadBatchSnapshots(project.getId(), "fp")).isEmpty();
        assertThat(service.loadBatchSnapshots(project.getId(), "unknown")).isEmpty();
    }

    private SectionCitationReviewResponse batchResult(String fingerprint) {
        return new SectionCitationReviewResponse(
                "section-critique-v4",
                "critique-rules-v2",
                UUID.randomUUID(),
                2,
                fingerprint,
                "content",
                LocalDateTime.of(2026, 8, 11, 10, 30),
                "provider",
                "model",
                false,
                "Partial review",
                List.of(new SectionCitationReviewResponse.Finding(
                        SectionCitationReviewResponse.FindingType.UNSUBSTANTIATED_CLAIM,
                        "claim", 0, 5, "why",
                        SectionCitationReviewResponse.Confidence.HIGH, List.of())),
                List.of());
    }
}
