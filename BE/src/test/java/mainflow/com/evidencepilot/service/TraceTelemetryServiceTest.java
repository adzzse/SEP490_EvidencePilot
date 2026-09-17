package com.evidencepilot.service;

import com.evidencepilot.model.CitationReviewRound;
import com.evidencepilot.model.EvidenceRevisionTrace;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.model.enums.InstructorJudgment;
import com.evidencepilot.model.enums.StudentAction;
import com.evidencepilot.repository.CitationReviewRoundRepository;
import com.evidencepilot.repository.EvidenceRevisionTraceRepository;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class TraceTelemetryServiceTest {

    private final CitationReviewRoundRepository roundRepository =
            mock(CitationReviewRoundRepository.class);
    private final EvidenceRevisionTraceRepository traceRepository =
            mock(EvidenceRevisionTraceRepository.class);
    private final TraceTelemetryService service =
            new TraceTelemetryService(roundRepository, traceRepository);

    @Test
    void telemetry_aggregatesProjectSectionAndRoundMetrics() {
        UUID projectId = UUID.randomUUID();
        PaperSection section = new PaperSection();
        section.setId(UUID.randomUUID());
        section.setSectionTitle("Introduction");
        CitationReviewRound older = round(section, LocalDateTime.of(2026, 8, 13, 10, 0));
        CitationReviewRound latest = round(section, LocalDateTime.of(2026, 8, 14, 10, 0));

        EvidenceRevisionTrace olderEffective = trace(older, section);
        olderEffective.setStudentAction(StudentAction.ADD_CITATION);
        olderEffective.setJudgment(InstructorJudgment.EFFECTIVE);
        olderEffective.setRoundDurationMs(1_000L);
        EvidenceRevisionTrace olderUnaddressed = trace(older, section);
        EvidenceRevisionTrace latestPending = trace(latest, section);
        latestPending.setStudentAction(StudentAction.QUALIFY);
        latestPending.setRoundDurationMs(3_000L);

        when(roundRepository.findByProjectIdOrderByCreatedAtDesc(projectId))
                .thenReturn(List.of(latest, older));
        when(traceRepository.findByProjectIdOrderByCreatedAtDesc(projectId))
                .thenReturn(List.of(latestPending, olderUnaddressed, olderEffective));

        var telemetry = service.telemetry(projectId);

        assertThat(telemetry.overview().reviewRounds()).isEqualTo(2);
        assertThat(telemetry.overview().findings()).isEqualTo(3);
        assertThat(telemetry.overview().addressed()).isEqualTo(2);
        assertThat(telemetry.overview().unaddressed()).isEqualTo(1);
        assertThat(telemetry.overview().pendingInstructor()).isEqualTo(1);
        assertThat(telemetry.overview().effective()).isEqualTo(1);
        assertThat(telemetry.overview().partial()).isZero();
        assertThat(telemetry.overview().ineffective()).isZero();
        assertThat(telemetry.overview().actionRate())
                .isCloseTo(2.0 / 3.0, within(0.0001));
        assertThat(telemetry.overview().effectiveRate()).isEqualTo(1.0);
        assertThat(telemetry.overview().averageTimeToActionMs()).isEqualTo(2_000);

        assertThat(telemetry.sections()).singleElement().satisfies(metrics -> {
            assertThat(metrics.latestRoundId()).isEqualTo(latest.getId());
            assertThat(metrics.findingDelta()).isEqualTo(-1);
            assertThat(metrics.findings()).isEqualTo(3);
            assertThat(metrics.pendingInstructor()).isEqualTo(1);
        });
        assertThat(telemetry.rounds()).hasSize(2);
        assertThat(telemetry.rounds().getFirst().roundId()).isEqualTo(latest.getId());
        assertThat(telemetry.rounds().getFirst().findingCount()).isEqualTo(1);
        assertThat(telemetry.rounds().getFirst().findingDelta()).isEqualTo(-1);
        assertThat(telemetry.rounds().getLast().findingCount()).isEqualTo(2);
        assertThat(telemetry.rounds().getLast().findingDelta()).isNull();
    }

    private CitationReviewRound round(PaperSection section, LocalDateTime createdAt) {
        CitationReviewRound round = new CitationReviewRound();
        round.setId(UUID.randomUUID());
        round.setSection(section);
        round.setCreatedAt(createdAt);
        return round;
    }

    private EvidenceRevisionTrace trace(CitationReviewRound round, PaperSection section) {
        EvidenceRevisionTrace trace = new EvidenceRevisionTrace();
        trace.setId(UUID.randomUUID());
        trace.setRound(round);
        trace.setSection(section);
        return trace;
    }
}
