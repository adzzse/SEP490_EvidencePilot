package com.evidencepilot.service.impl;

import com.evidencepilot.model.AiEvaluationJob;
import com.evidencepilot.repository.AiEvaluationJobRepository;
import com.evidencepilot.repository.CitationReviewRoundRepository;
import com.evidencepilot.repository.EvidenceRevisionTraceRepository;
import com.evidencepilot.repository.ReviewSectionSnapshotRepository;
import com.evidencepilot.repository.SectionStandardEvaluationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
@RequiredArgsConstructor
public class SectionWorkHistoryService {

    private final ReviewSectionSnapshotRepository reviewSectionSnapshotRepository;
    private final CitationReviewRoundRepository citationReviewRoundRepository;
    private final SectionStandardEvaluationRepository sectionStandardEvaluationRepository;
    private final AiEvaluationJobRepository aiEvaluationJobRepository;
    private final EvidenceRevisionTraceRepository evidenceRevisionTraceRepository;

    public boolean hasPersistedHistory(UUID sectionId) {
        return sectionId != null
                && (reviewSectionSnapshotRepository.existsBySectionId(sectionId)
                || citationReviewRoundRepository.existsBySectionId(sectionId)
                || sectionStandardEvaluationRepository.existsBySectionId(sectionId)
                || aiEvaluationJobRepository.existsBySectionIdAndKind(
                        sectionId, AiEvaluationJob.KIND_SECTION_CITATION_REVIEW)
                || evidenceRevisionTraceRepository.existsBySectionId(sectionId));
    }
}
