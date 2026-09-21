package com.evidencepilot.service.impl;

import com.evidencepilot.repository.AiEvaluationJobRepository;
import com.evidencepilot.repository.CitationReviewRoundRepository;
import com.evidencepilot.repository.EvidenceRevisionTraceRepository;
import com.evidencepilot.repository.ReviewSectionSnapshotRepository;
import com.evidencepilot.repository.SectionStandardEvaluationRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SectionWorkHistoryServiceTest {

    @Mock private ReviewSectionSnapshotRepository reviewSectionSnapshotRepository;
    @Mock private CitationReviewRoundRepository citationReviewRoundRepository;
    @Mock private SectionStandardEvaluationRepository sectionStandardEvaluationRepository;
    @Mock private AiEvaluationJobRepository aiEvaluationJobRepository;
    @Mock private EvidenceRevisionTraceRepository evidenceRevisionTraceRepository;

    @Test
    void detectsPersistedReviewHistoryAcrossSectionCheckpointTables() {
        UUID sectionId = UUID.randomUUID();
        when(sectionStandardEvaluationRepository.existsBySectionId(sectionId)).thenReturn(true);

        SectionWorkHistoryService service = new SectionWorkHistoryService(
                reviewSectionSnapshotRepository,
                citationReviewRoundRepository,
                sectionStandardEvaluationRepository,
                aiEvaluationJobRepository,
                evidenceRevisionTraceRepository);

        assertThat(service.hasPersistedHistory(sectionId)).isTrue();
    }
}
