package mainflow.com.evidencepilot.service;

import com.evidencepilot.dto.ExtractionResultPayload;
import com.evidencepilot.dto.SparseVector;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.DocumentChunk;
import com.evidencepilot.model.DocumentExtractionCandidate;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.ExtractionCandidateStatus;
import com.evidencepilot.model.enums.ProcessingStatus;
import com.evidencepilot.repository.DocumentExtractionCandidateRepository;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.AssignmentSectionBaselineRepository;
import com.evidencepilot.repository.EvidenceRevisionTraceRepository;
import com.evidencepilot.repository.InstructorFeedbackRepository;
import com.evidencepilot.repository.PaperReferenceRepository;
import com.evidencepilot.repository.PaperSectionRepository;
import com.evidencepilot.service.impl.DocumentPersistenceService;
import com.evidencepilot.service.impl.ExtractionCandidateService;
import com.evidencepilot.service.impl.PaperProcessingServiceImpl;
import com.evidencepilot.service.impl.QdrantServiceImpl;
import com.evidencepilot.service.impl.SectionWorkHistoryService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ExtractionCandidateServiceTest {

    @Mock
    private DocumentExtractionCandidateRepository candidateRepository;
    @Mock
    private DocumentRepository documentRepository;
    @Mock
    private PaperSectionRepository paperSectionRepository;
    @Mock
    private AssignmentSectionBaselineRepository assignmentSectionBaselineRepository;
    @Mock
    private InstructorFeedbackRepository instructorFeedbackRepository;
    @Mock
    private PaperReferenceRepository paperReferenceRepository;
    @Mock
    private EvidenceRevisionTraceRepository evidenceRevisionTraceRepository;
    @Mock
    private DocumentPersistenceService documentPersistenceService;
    @Mock
    private QdrantServiceImpl qdrantService;
    @Mock
    private PaperProcessingServiceImpl paperProcessingService;
    @Mock
    private SectionWorkHistoryService sectionWorkHistoryService;

    @Test
    void requestAllowsImportedPaperTextWithoutWorkHistory() {
        Document document = document(DocumentType.PAPER);
        PaperSection section = new PaperSection();
        section.setId(UUID.randomUUID());
        section.setDocument(document);
        section.setContentTex("imported setup text");
        section.setVersion(1);

        when(documentRepository.findByIdForUpdate(document.getId())).thenReturn(Optional.of(document));
        when(candidateRepository.existsActiveForDocument(document.getId())).thenReturn(false);
        when(paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(document.getId()))
                .thenReturn(List.of(section));

        when(candidateRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        assertThat(service().request(document.getId()).getStatus())
                .isEqualTo(ExtractionCandidateStatus.REQUESTED);
    }

    @Test
    void requestStoresTheLiveFingerprintAndRejectsDuplicateActiveCandidate() {
        Document document = document(DocumentType.SOURCE);
        document.setFileUrl("sources/raw/source.pdf");
        document.setFileHashSha256("old-hash");
        document.setProcessingStatus(ProcessingStatus.READY);
        when(documentRepository.findByIdForUpdate(document.getId())).thenReturn(Optional.of(document));
        when(candidateRepository.existsActiveForDocument(document.getId())).thenReturn(false);
        when(candidateRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        var candidate = service().request(document.getId());

        assertThat(candidate.getStatus()).isEqualTo(ExtractionCandidateStatus.REQUESTED);
        assertThat(candidate.getSourceFileUrl()).isEqualTo("sources/raw/source.pdf");
        assertThat(candidate.getSourceFileHashSha256()).isEqualTo("old-hash");
        assertThat(candidate.getPreviousProcessingStatus()).isEqualTo(ProcessingStatus.READY);

        when(candidateRepository.existsActiveForDocument(document.getId())).thenReturn(true);
        assertThatThrownBy(() -> service().request(document.getId()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("already in progress");
    }

    @Test
    void failedCandidateRestoresPreviousLiveStatus() {
        Document document = document(DocumentType.SOURCE);
        document.setProcessingStatus(ProcessingStatus.PROCESSING);
        var candidate = candidate(document, ExtractionCandidateStatus.PROCESSING);
        candidate.setPreviousProcessingStatus(ProcessingStatus.READY);
        candidate.setPreviousChunkCount(3);
        candidate.setPreviousProcessedAt(LocalDateTime.of(2026, 9, 20, 10, 0));

        when(candidateRepository.findById(candidate.getId())).thenReturn(Optional.of(candidate));
        when(documentRepository.findByIdForUpdate(document.getId())).thenReturn(Optional.of(document));
        when(candidateRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        service().markFailed(candidate.getId(), "candidate extraction failed");

        assertThat(candidate.getStatus()).isEqualTo(ExtractionCandidateStatus.FAILED);
        assertThat(document.getProcessingStatus()).isEqualTo(ProcessingStatus.READY);
        assertThat(document.getChunkCount()).isEqualTo(3);
        assertThat(document.getProcessedAt()).isEqualTo(candidate.getPreviousProcessedAt());
        verify(documentRepository).save(document);
    }

    @Test
    void activationRejectsAChangedFileBeforeWritingLiveExtraction() throws Exception {
        Document document = document(DocumentType.SOURCE);
        document.setFileUrl("sources/raw/new.pdf");
        document.setFileHashSha256("new-hash");
        var candidate = candidate(document, ExtractionCandidateStatus.READY);
        candidate.setSourceFileUrl("sources/raw/old.pdf");
        candidate.setSourceFileHashSha256("old-hash");
        candidate.setChunksJson(new ObjectMapper().writeValueAsString(List.of()));

        when(candidateRepository.findById(candidate.getId())).thenReturn(Optional.of(candidate));
        when(documentRepository.findByIdForUpdate(document.getId())).thenReturn(Optional.of(document));

        assertThatThrownBy(() -> service().activate(candidate.getId()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("changed");

        verify(documentPersistenceService, never()).saveExtraction(any(), any(), any(), any());
        verify(qdrantService, never()).upsertVectors(any());
    }

    @Test
    void activationRechecksWorkThatAppearedWhileCandidateWasRunning() throws Exception {
        Document document = document(DocumentType.PAPER);
        document.setFileUrl("papers/raw/paper.pdf");
        document.setFileHashSha256("hash");
        var candidate = candidate(document, ExtractionCandidateStatus.READY);
        candidate.setSourceFileUrl(document.getFileUrl());
        candidate.setSourceFileHashSha256(document.getFileHashSha256());
        candidate.setChunksJson(new ObjectMapper().writeValueAsString(List.of()));
        PaperSection section = new PaperSection();
        section.setId(UUID.randomUUID());
        section.setDocument(document);
        section.setPreviousContentTex("work added while extraction ran");
        when(candidateRepository.findById(candidate.getId())).thenReturn(Optional.of(candidate));
        when(documentRepository.findByIdForUpdate(document.getId())).thenReturn(Optional.of(document));
        when(paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(document.getId()))
                .thenReturn(List.of(section));

        assertThatThrownBy(() -> service().activate(candidate.getId()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("meaningful work");

        verify(documentPersistenceService, never()).replaceExtraction(any(), any(), any(), any());
        verify(qdrantService, never()).stageVectors(any());
    }

    @Test
    void requestRejectsPersistedSectionHistory() {
        Document document = document(DocumentType.PAPER);
        PaperSection section = new PaperSection();
        section.setId(UUID.randomUUID());
        section.setDocument(document);

        when(documentRepository.findByIdForUpdate(document.getId())).thenReturn(Optional.of(document));
        when(candidateRepository.existsActiveForDocument(document.getId())).thenReturn(false);
        when(paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(document.getId()))
                .thenReturn(List.of(section));
        when(sectionWorkHistoryService.hasPersistedHistory(section.getId())).thenReturn(true);

        assertThatThrownBy(() -> service().request(document.getId()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("meaningful work");
        verify(candidateRepository, never()).save(any());
    }

    @Test
    void activationReplacesLiveDerivedDataOnlyAfterCandidateIsReady() throws Exception {
        Document document = document(DocumentType.SOURCE);
        document.setFileUrl("sources/raw/source.pdf");
        document.setFileHashSha256("hash");
        document.setProcessingStatus(ProcessingStatus.PROCESSING);
        var candidate = candidate(document, ExtractionCandidateStatus.READY);
        candidate.setSourceFileUrl(document.getFileUrl());
        candidate.setSourceFileHashSha256(document.getFileHashSha256());
        var staged = new ExtractionResultPayload.ChunkPayload(
                UUID.randomUUID(), 0, "new text", List.of(0.5f), new SparseVector(List.of(), List.of()));
        candidate.setExtractionMethod("mineru");
        candidate.setExtractedMarkdown("new markdown");
        candidate.setChunksJson(new ObjectMapper().writeValueAsString(List.of(staged)));
        DocumentChunk saved = new DocumentChunk();
        saved.setId(UUID.randomUUID());
        saved.setChunkIndex(0);
        saved.setText("new text");
        saved.setActive(true);
        when(candidateRepository.findById(candidate.getId())).thenReturn(Optional.of(candidate));
        when(documentRepository.findByIdForUpdate(document.getId())).thenReturn(Optional.of(document));
        when(documentPersistenceService.replaceExtraction(
                document.getId(), "mineru", "new markdown", List.of("new text")))
                .thenReturn(new DocumentPersistenceService.ExtractionReplacement(List.of(saved), List.of()));
        when(candidateRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        service().activate(candidate.getId());

        ArgumentCaptor<ExtractionResultPayload> payload = ArgumentCaptor.forClass(ExtractionResultPayload.class);
        verify(qdrantService).stageVectors(payload.capture());
        assertThat(payload.getValue().chunks()).singleElement()
                .extracting(ExtractionResultPayload.ChunkPayload::chunkId)
                .isEqualTo(saved.getId());
        verify(documentPersistenceService).markReady(document.getId(), 1);
        assertThat(candidate.getStatus()).isEqualTo(ExtractionCandidateStatus.ACTIVATED);
    }

    private ExtractionCandidateService service() {
        return new ExtractionCandidateService(
                candidateRepository,
                documentRepository,
                paperSectionRepository,
                assignmentSectionBaselineRepository,
                instructorFeedbackRepository,
                paperReferenceRepository,
                evidenceRevisionTraceRepository,
                documentPersistenceService,
                qdrantService,
                paperProcessingService,
                new ObjectMapper(),
                sectionWorkHistoryService);
    }

    private static Document document(DocumentType type) {
        Document document = new Document();
        document.setId(UUID.randomUUID());
        document.setDocType(type);
        document.setFileUrl("sources/raw/document.pdf");
        document.setFileHashSha256("hash");
        document.setProcessingStatus(ProcessingStatus.READY);
        document.setChunkCount(3);
        document.setProcessedAt(LocalDateTime.of(2026, 9, 20, 10, 0));
        return document;
    }

    private static DocumentExtractionCandidate candidate(
            Document document, ExtractionCandidateStatus status) {
        DocumentExtractionCandidate candidate = new DocumentExtractionCandidate();
        candidate.setId(UUID.randomUUID());
        candidate.setDocument(document);
        candidate.setStatus(status);
        candidate.setPreviousProcessingStatus(ProcessingStatus.READY);
        candidate.setPreviousChunkCount(document.getChunkCount());
        candidate.setPreviousProcessedAt(document.getProcessedAt());
        return candidate;
    }
}
