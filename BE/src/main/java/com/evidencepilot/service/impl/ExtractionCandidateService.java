package com.evidencepilot.service.impl;

import com.evidencepilot.dto.ExtractionResultPayload;
import com.evidencepilot.exception.ResourceNotFoundException;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.DocumentChunk;
import com.evidencepilot.model.DocumentExtractionCandidate;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.ExtractionCandidateStatus;
import com.evidencepilot.model.enums.ProcessingStatus;
import com.evidencepilot.repository.DocumentExtractionCandidateRepository;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.EvidenceRevisionTraceRepository;
import com.evidencepilot.repository.InstructorFeedbackRepository;
import com.evidencepilot.repository.PaperReferenceRepository;
import com.evidencepilot.repository.PaperSectionRepository;
import com.evidencepilot.service.AiModelClient;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JavaType;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

/**
 * Owns the one-live-plus-one-candidate extraction lifecycle. Candidate rows
 * contain only staged extraction output; live text, chunks, vectors, and
 * sections are changed by {@link #activate(UUID)} after the candidate is
 * complete and its source fingerprint is still current.
 */
@Service
@RequiredArgsConstructor
public class ExtractionCandidateService {

    private static final List<ExtractionCandidateStatus> ACTIVE_STATUSES = List.of(
            ExtractionCandidateStatus.REQUESTED,
            ExtractionCandidateStatus.PROCESSING,
            ExtractionCandidateStatus.READY);

    private final DocumentExtractionCandidateRepository candidateRepository;
    private final DocumentRepository documentRepository;
    private final PaperSectionRepository paperSectionRepository;
    private final InstructorFeedbackRepository instructorFeedbackRepository;
    private final PaperReferenceRepository paperReferenceRepository;
    private final EvidenceRevisionTraceRepository evidenceRevisionTraceRepository;
    private final DocumentPersistenceService documentPersistenceService;
    private final QdrantServiceImpl qdrantService;
    private final PaperProcessingServiceImpl paperProcessingService;
    private final ObjectMapper objectMapper;

    @Transactional
    public DocumentExtractionCandidate request(UUID documentId) {
        Document document = documentRepository.findByIdForUpdate(documentId)
                .orElseThrow(() -> new ResourceNotFoundException(documentId, "Document"));
        if (document.getProcessingStatus() != ProcessingStatus.READY
                && document.getProcessingStatus() != ProcessingStatus.FAILED) {
            throw conflict("Document is currently " + document.getProcessingStatus()
                    + " and cannot be re-extracted");
        }
        if (candidateRepository.existsActiveForDocument(documentId)) {
            throw conflict("An extraction candidate is already in progress");
        }
        requireNoMeaningfulWork(document);

        DocumentExtractionCandidate candidate = new DocumentExtractionCandidate();
        candidate.setDocument(document);
        candidate.setStatus(ExtractionCandidateStatus.REQUESTED);
        candidate.setPreviousProcessingStatus(document.getProcessingStatus());
        candidate.setPreviousChunkCount(document.getChunkCount());
        candidate.setPreviousProcessedAt(document.getProcessedAt());
        candidate.setPreviousProcessingError(document.getProcessingError());
        candidate.setSourceFileUrl(document.getFileUrl());
        candidate.setSourceFileHashSha256(document.getFileHashSha256());
        candidate.setCreatedAt(LocalDateTime.now());
        return candidateRepository.save(candidate);
    }

    @Transactional(readOnly = true)
    public Optional<DocumentExtractionCandidate> findPending(UUID documentId) {
        return candidateRepository.findLatestForDocumentWithLock(documentId, ACTIVE_STATUSES);
    }

    @Transactional
    public void markProcessing(UUID candidateId) {
        DocumentExtractionCandidate candidate = requireCandidate(candidateId);
        if (candidate.getStatus() == ExtractionCandidateStatus.REQUESTED) {
            candidate.setStatus(ExtractionCandidateStatus.PROCESSING);
            candidateRepository.save(candidate);
        }
    }

    @Transactional
    public void prepare(
            UUID candidateId,
            String extractionMethod,
            String extractedMarkdown,
            List<AiModelClient.ExtractionBlock> blocks,
            List<ExtractionResultPayload.ChunkPayload> chunks) {
        prepare(candidateId, extractionMethod, extractedMarkdown, blocks, chunks, null);
    }

    @Transactional
    public void prepare(
            UUID candidateId,
            String extractionMethod,
            String extractedMarkdown,
            List<AiModelClient.ExtractionBlock> blocks,
            List<ExtractionResultPayload.ChunkPayload> chunks,
            String bundleKey) {
        DocumentExtractionCandidate candidate = requireCandidate(candidateId);
        if (candidate.getStatus() != ExtractionCandidateStatus.PROCESSING
                && candidate.getStatus() != ExtractionCandidateStatus.REQUESTED) {
            throw conflict("Extraction candidate is not available for preparation");
        }
        candidate.setExtractionMethod(extractionMethod);
        candidate.setExtractedMarkdown(extractedMarkdown);
        candidate.setBlocksJson(writeJson(blocks == null ? List.of() : blocks));
        candidate.setChunksJson(writeJson(chunks == null ? List.of() : chunks));
        candidate.setBundleKey(bundleKey);
        candidate.setPreparedAt(LocalDateTime.now());
        candidate.setStatus(ExtractionCandidateStatus.READY);
        candidateRepository.save(candidate);
    }

    @Transactional
    public void markFailed(UUID candidateId, String failureMessage) {
        DocumentExtractionCandidate candidate = requireCandidate(candidateId);
        candidate.setStatus(ExtractionCandidateStatus.FAILED);
        candidate.setFailedAt(LocalDateTime.now());
        candidate.setFailureMessage(trimFailure(failureMessage));
        candidateRepository.save(candidate);

        Document document = documentRepository.findByIdForUpdate(candidate.getDocument().getId())
                .orElseThrow(() -> new ResourceNotFoundException(
                        candidate.getDocument().getId(), "Document"));
        if (document.getProcessingStatus() == ProcessingStatus.PROCESSING) {
            document.setProcessingStatus(candidate.getPreviousProcessingStatus());
            document.setChunkCount(candidate.getPreviousChunkCount());
            document.setProcessedAt(candidate.getPreviousProcessedAt());
            document.setProcessingError(candidate.getPreviousProcessingError());
            documentRepository.save(document);
        }
    }

    @Transactional
    public void activate(UUID candidateId) {
        DocumentExtractionCandidate candidate = requireCandidate(candidateId);
        if (candidate.getStatus() != ExtractionCandidateStatus.READY) {
            throw conflict("Extraction candidate is not ready for activation");
        }
        Document document = documentRepository.findByIdForUpdate(candidate.getDocument().getId())
                .orElseThrow(() -> new ResourceNotFoundException(
                        candidate.getDocument().getId(), "Document"));
        if (!Objects.equals(candidate.getSourceFileUrl(), document.getFileUrl())
                || !Objects.equals(candidate.getSourceFileHashSha256(), document.getFileHashSha256())) {
            throw conflict("The document file changed while the extraction candidate was running");
        }
        requireNoMeaningfulWork(document);

        List<ExtractionResultPayload.ChunkPayload> stagedChunks = readChunks(candidate.getChunksJson());
        List<String> texts = stagedChunks.stream()
                .map(ExtractionResultPayload.ChunkPayload::text)
                .toList();
        List<DocumentChunk> savedChunks = documentPersistenceService.saveExtraction(
                document.getId(), candidate.getExtractionMethod(), candidate.getExtractedMarkdown(), texts);
        if (savedChunks.size() != stagedChunks.size()) {
            throw new IllegalStateException("Failed to persist every candidate document chunk");
        }

        List<ExtractionResultPayload.ChunkPayload> livePayload = remapChunkIds(stagedChunks, savedChunks);
        qdrantService.upsertVectors(new ExtractionResultPayload(document.getId(), livePayload));

        List<AiModelClient.ExtractionBlock> blocks = readBlocks(candidate.getBlocksJson());
        if (document.getDocType() == DocumentType.PAPER) {
            if (blocks.isEmpty()) {
                paperProcessingService.detectAndPersistSections(document.getId());
            } else {
                paperProcessingService.detectAndPersistSections(document.getId(), blocks);
            }
        }
        documentPersistenceService.markReady(document.getId(), livePayload.size());
        candidate.setStatus(ExtractionCandidateStatus.ACTIVATED);
        candidateRepository.save(candidate);
    }

    private void requireNoMeaningfulWork(Document document) {
        if (document.getDocType() == DocumentType.SOURCE) {
            if (paperReferenceRepository.existsActiveForSource(document.getId())
                    || evidenceRevisionTraceRepository.existsActiveForSource(document.getId())) {
                throw conflict("Source extraction cannot be replaced after paper or review history depends on it");
            }
            return;
        }

        List<PaperSection> sections = paperSectionRepository
                .findByDocumentIdOrderBySectionOrderAsc(document.getId());
        if (sections.stream().anyMatch(this::hasMeaningfulSectionWork)) {
            throw conflict("Paper extraction cannot be replaced after meaningful work or review history exists");
        }
    }

    private boolean hasMeaningfulSectionWork(PaperSection section) {
        if (section.getAssignedUser() != null
                || hasText(section.getContentTex())
                || hasText(section.getPreviousContentTex())
                || (section.getVersion() != null && section.getVersion() > 1)) {
            return true;
        }
        return !instructorFeedbackRepository.findBySectionId(section.getId()).isEmpty()
                || !evidenceRevisionTraceRepository.findBySectionIdOrderByCreatedAtDesc(section.getId()).isEmpty();
    }

    private DocumentExtractionCandidate requireCandidate(UUID candidateId) {
        return candidateRepository.findById(candidateId)
                .orElseThrow(() -> new ResourceNotFoundException(candidateId, "Extraction candidate"));
    }

    private List<ExtractionResultPayload.ChunkPayload> readChunks(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            JavaType type = objectMapper.getTypeFactory().constructCollectionType(
                    List.class, ExtractionResultPayload.ChunkPayload.class);
            return objectMapper.readValue(json, type);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Stored extraction candidate chunks are invalid", e);
        }
    }

    private List<AiModelClient.ExtractionBlock> readBlocks(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            JavaType type = objectMapper.getTypeFactory().constructCollectionType(
                    List.class, AiModelClient.ExtractionBlock.class);
            return objectMapper.readValue(json, type);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Stored extraction candidate blocks are invalid", e);
        }
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Failed to serialize extraction candidate", e);
        }
    }

    private static List<ExtractionResultPayload.ChunkPayload> remapChunkIds(
            List<ExtractionResultPayload.ChunkPayload> staged,
            List<DocumentChunk> saved) {
        return java.util.stream.IntStream.range(0, staged.size())
                .mapToObj(index -> {
                    ExtractionResultPayload.ChunkPayload source = staged.get(index);
                    DocumentChunk live = saved.get(index);
                    return new ExtractionResultPayload.ChunkPayload(
                            live.getId(),
                            live.getChunkIndex(),
                            live.getText(),
                            source.denseEmbedding(),
                            source.sparseEmbedding());
                })
                .toList();
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private static ResponseStatusException conflict(String message) {
        return new ResponseStatusException(HttpStatus.CONFLICT, message);
    }

    private static String trimFailure(String message) {
        if (message == null || message.isBlank()) {
            return "Candidate extraction failed";
        }
        return message.length() <= 2000 ? message : message.substring(0, 2000);
    }
}
