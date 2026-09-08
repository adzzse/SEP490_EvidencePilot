package com.evidencepilot.service.impl;

import com.evidencepilot.model.Project;
import com.evidencepilot.model.ProjectCheckpoint;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.InstructorFeedbackRepository;
import com.evidencepilot.repository.PaperSectionRepository;
import com.evidencepilot.repository.ProjectCheckpointRepository;
import com.evidencepilot.repository.ProjectRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CheckpointServiceImplTest {

    @Mock
    private ProjectCheckpointRepository checkpointRepository;
    @Mock
    private ProjectRepository projectRepository;
    @Mock
    private DocumentRepository documentRepository;
    @Mock
    private PaperSectionRepository paperSectionRepository;
    @Mock
    private InstructorFeedbackRepository instructorFeedbackRepository;

    private CheckpointServiceImpl service;
    private ObjectMapper objectMapper;
    private Project project;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        service = new CheckpointServiceImpl(
                checkpointRepository, projectRepository, documentRepository,
                paperSectionRepository, instructorFeedbackRepository, objectMapper);
        project = new Project();
        project.setId(UUID.randomUUID());
    }

    @Test
    void getLatestSectionBaselineReturnsTextFromNewestSnapshot() {
        String json = "{\"sections\":{\"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\":"
                + "{\"text\":\"hello world\",\"words\":2}}}";
        ProjectCheckpoint checkpoint = checkpoint(json, "SUBMIT_FOR_REVIEW", 1);
        when(checkpointRepository.findByProjectIdOrderByCreatedAtDesc(project.getId()))
                .thenReturn(List.of(checkpoint));

        var baseline = service.getLatestSectionBaseline(
                project.getId(), UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"), null);

        assertThat(baseline.contentTex()).isEqualTo("hello world");
        assertThat(baseline.trigger()).isEqualTo("SUBMIT_FOR_REVIEW");
    }

    @Test
    void getLatestSectionBaselineSkipsCheckpointsCreatedAtOrAfterBefore() {
        String olderJson = "{\"sections\":{\"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\":"
                + "{\"text\":\"baseline text\",\"words\":2}}}";
        String submitJson = "{\"sections\":{\"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\":"
                + "{\"text\":\"submitted text\",\"words\":2}}}";
        ProjectCheckpoint submitLock = checkpoint(submitJson, "SUBMIT_FOR_REVIEW", 0);
        ProjectCheckpoint previousLock = checkpoint(olderJson, "REVIEW_STATUS:RETURNED", 2);
        LocalDateTime cutoff = LocalDateTime.now().withNano(0);
        submitLock.setCreatedAt(cutoff);
        previousLock.setCreatedAt(cutoff.minusHours(2));
        when(checkpointRepository.findByProjectIdOrderByCreatedAtDesc(project.getId()))
                .thenReturn(List.of(submitLock, previousLock));

        var baseline = service.getLatestSectionBaseline(
                project.getId(), UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
                cutoff);

        assertThat(baseline.contentTex()).isEqualTo("baseline text");
        assertThat(baseline.trigger()).isEqualTo("REVIEW_STATUS:RETURNED");
    }

    @Test
    void getLatestSectionBaselineReturnsNullWithoutCheckpointsOrText() {
        when(checkpointRepository.findByProjectIdOrderByCreatedAtDesc(project.getId()))
                .thenReturn(List.of());
        assertThat(service.getLatestSectionBaseline(
                project.getId(), UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"), null)).isNull();

        String legacyJson = "{\"sections\":{\"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\":120}}";
        when(checkpointRepository.findByProjectIdOrderByCreatedAtDesc(project.getId()))
                .thenReturn(List.of(checkpoint(legacyJson, "SUBMIT_FOR_REVIEW", 1)));
        assertThat(service.getLatestSectionBaseline(
                project.getId(), UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"), null)).isNull();
    }

    @Test
    void diffReportsSectionWordAndFeedbackDeltas() throws Exception {
        String previousJson = "{\"sections\":{\"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\":"
                + "{\"text\":\"a\",\"words\":100}},"
                + "\"feedback\":{\"resolved\":2,\"open\":1}}";
        String newestJson = "{\"sections\":{\"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\":"
                + "{\"text\":\"b\",\"words\":120},\"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\":"
                + "{\"text\":\"c\",\"words\":40}},"
                + "\"feedback\":{\"resolved\":3,\"open\":0}}";

        ProjectCheckpoint prev = checkpoint(previousJson, "REVIEW_STATUS:RETURNED", 1);
        ProjectCheckpoint newest = checkpoint(newestJson, "SUBMIT_FOR_REVIEW", 2);
        when(checkpointRepository.findByProjectIdOrderByCreatedAtDesc(project.getId()))
                .thenReturn(List.of(newest, prev));

        var diff = service.getDiff(project.getId());

        assertThat(diff.feedbackResolvedDelta()).isEqualTo(1);
        assertThat(diff.sectionWordDeltas()).containsExactlyInAnyOrder(
                new com.evidencepilot.dto.response.CheckpointDiffResponse.WordCountDelta(
                        UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"), 100, 120),
                new com.evidencepilot.dto.response.CheckpointDiffResponse.WordCountDelta(
                        UUID.fromString("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"), 0, 40));
    }

    @Test
    void diffIsEmptyWhenFewerThanTwoCheckpointsExist() {
        ProjectCheckpoint single = checkpoint("{}", "SUBMIT_FOR_REVIEW", 1);
        when(checkpointRepository.findByProjectIdOrderByCreatedAtDesc(project.getId()))
                .thenReturn(List.of(single));

        var diff = service.getDiff(project.getId());

        assertThat(diff.sectionWordDeltas()).isEmpty();
        assertThat(diff.feedbackResolvedDelta()).isZero();
    }

    @Test
    void legacyAnswerCountsCannotBeComparedToResolutionCounts() {
        when(checkpointRepository.findByProjectIdOrderByCreatedAtDesc(project.getId()))
                .thenReturn(List.of(checkpoint("{\"feedback\":{\"resolved\":2,\"open\":1}}", "RETURNED", 1),
                        checkpoint("{\"feedback\":{\"answered\":2,\"unanswered\":1}}", "RETURNED", 2)));
        assertThat(service.getDiff(project.getId()).feedbackResolvedDelta()).isNull();
    }

    @Test
    void captureCountsOnlyPublishedResolutionStates() throws Exception {
        when(projectRepository.findById(project.getId())).thenReturn(java.util.Optional.of(project));
        var resolved = new com.evidencepilot.model.InstructorFeedback();
        resolved.setPublishedAt(LocalDateTime.now());
        resolved.setThreadState(com.evidencepilot.model.enums.FeedbackThreadState.DONE);
        var open = new com.evidencepilot.model.InstructorFeedback();
        open.setPublishedAt(LocalDateTime.now());
        // A pending instructor state change must not leak into student-visible counts.
        open.setPendingState(com.evidencepilot.model.enums.FeedbackThreadState.DONE);
        var draft = new com.evidencepilot.model.InstructorFeedback();
        draft.setThreadState(com.evidencepilot.model.enums.FeedbackThreadState.DONE);
        when(instructorFeedbackRepository.findByRequestProjectId(project.getId()))
                .thenReturn(List.of(resolved, open, draft));
        service.capture(project.getId(), "RETURNED");
        var saved = org.mockito.ArgumentCaptor.forClass(ProjectCheckpoint.class);
        verify(checkpointRepository).save(saved.capture());
        var counts = objectMapper.readTree(saved.getValue().getSnapshotJson()).path("feedback");
        assertThat(counts).isEqualTo(objectMapper.readTree("{\"resolved\":1,\"open\":1}"));
    }

    @Test
    void capturePersistsSnapshotAndNeverThrows() {
        when(projectRepository.findById(project.getId())).thenReturn(java.util.Optional.of(project));
        when(documentRepository.findByProjectIdAndDocTypeAndActiveTrue(
                eq(project.getId()), eq(com.evidencepilot.model.enums.DocumentType.PAPER)))
                .thenReturn(List.of());
        when(instructorFeedbackRepository.findByRequestProjectId(project.getId())).thenReturn(List.of());

        service.capture(project.getId(), "SUBMIT_FOR_REVIEW");

        verify(checkpointRepository).save(any(ProjectCheckpoint.class));
    }

    @Test
    void captureSwallowsPersistenceFailures() {
        when(checkpointRepository.save(any())).thenThrow(new RuntimeException("db down"));

        service.capture(project.getId(), "SUBMIT_FOR_REVIEW");

        verify(checkpointRepository, never()).delete(any());
    }

    private ProjectCheckpoint checkpoint(String snapshotJson, String trigger, int hour) {
        ProjectCheckpoint checkpoint = new ProjectCheckpoint();
        checkpoint.setId(UUID.randomUUID());
        checkpoint.setProject(project);
        checkpoint.setTrigger(trigger);
        checkpoint.setSnapshotJson(snapshotJson);
        checkpoint.setCreatedAt(LocalDateTime.now().minusHours(hour));
        return checkpoint;
    }
}
