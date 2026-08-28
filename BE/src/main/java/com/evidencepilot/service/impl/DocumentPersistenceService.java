package com.evidencepilot.service.impl;

import com.evidencepilot.exception.ResourceNotFoundException;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.DocumentChunk;
import com.evidencepilot.model.DocumentText;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.ProcessingStatus;
import com.evidencepilot.repository.DocumentChunkRepository;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.DocumentTextRepository;
import com.evidencepilot.service.event.DocumentUploadedEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class DocumentPersistenceService {

    private final DocumentRepository documentRepository;
    private final DocumentTextRepository documentTextRepository;
    private final DocumentChunkRepository documentChunkRepository;
    private final ApplicationEventPublisher eventPublisher;

    @Transactional
    public Document savePendingDocument(
            com.evidencepilot.model.Project project,
            com.evidencepilot.model.Collection collection,
            User uploadedBy,
            DocumentType docType,
            String originalFilename,
            String contentType,
            long fileSizeBytes) {
        Document document = new Document();
        document.setProject(project);
        document.setCollection(collection);
        document.setUploadedBy(uploadedBy);
        document.setDocType(docType);
        document.setFileUrl("pending");
        document.setOriginalFilename(originalFilename);
        document.setContentType(contentType);
        document.setFileSizeBytes(fileSizeBytes);
        document.setProcessingStatus(ProcessingStatus.PENDING_UPLOAD);
        document.setActive(true);
        document.setCreatedAt(LocalDateTime.now());
        document.setDownloadToken(UUID.randomUUID().toString());
        return documentRepository.save(document);
    }

    @Transactional
    public Document markDocumentAsUploaded(UUID documentId, String fileUrl, String fileHashSha256) {
        Document document = documentRepository.findById(documentId)
                .orElseThrow(() -> new ResourceNotFoundException(documentId, "Document"));
        document.setProcessingStatus(ProcessingStatus.UPLOADED);
        document.setFileUrl(fileUrl);
        document.setFileHashSha256(fileHashSha256);
        Document saved = documentRepository.save(document);
        eventPublisher.publishEvent(new DocumentUploadedEvent(saved.getId()));
        return saved;
    }

    @Transactional
    public boolean markProcessing(UUID documentId) {
        return documentRepository.claimQueued(
                documentId, ProcessingStatus.QUEUED, ProcessingStatus.PROCESSING) == 1;
    }

    @Transactional
    public boolean markQueuedForRetry(UUID documentId) {
        return documentRepository.queueForExtraction(
                documentId, List.of(ProcessingStatus.PROCESSING), ProcessingStatus.QUEUED) == 1;
    }

    @Transactional
    public List<DocumentChunk> saveExtraction(
            UUID documentId,
            String method,
            String markdown,
            List<String> chunks) {
        Document document = requireDocument(documentId);
        DocumentText text = documentTextRepository.findByDocumentId(documentId);
        if (text == null) {
            text = new DocumentText();
            text.setDocument(document);
        }
        text.setExtractionMethod(method);
        text.setExtractedText(markdown);
        documentTextRepository.save(text);

        List<DocumentChunk> existing = documentChunkRepository.findByDocumentIdOrderByChunkIndexAsc(documentId);
        Map<Integer, DocumentChunk> byIndex = new HashMap<>();
        existing.forEach(chunk -> byIndex.put(chunk.getChunkIndex(), chunk));

        List<DocumentChunk> current = new ArrayList<>();
        for (int index = 0; index < chunks.size(); index++) {
            DocumentChunk chunk = byIndex.get(index);
            if (chunk == null) {
                chunk = new DocumentChunk();
                chunk.setDocument(document);
                chunk.setChunkIndex(index);
            }
            chunk.setText(chunks.get(index));
            chunk.setActive(true);
            current.add(chunk);
        }
        existing.stream()
                .filter(chunk -> chunk.getChunkIndex() >= chunks.size())
                .forEach(chunk -> chunk.setActive(false));

        List<DocumentChunk> changed = new ArrayList<>(current);
        changed.addAll(existing.stream().filter(chunk -> !chunk.isActive()).toList());
        return documentChunkRepository.saveAll(changed).stream()
                .filter(DocumentChunk::isActive)
                .sorted(Comparator.comparing(DocumentChunk::getChunkIndex))
                .toList();
    }

    @Transactional
    public void markReady(UUID documentId, int chunkCount) {
        Document document = requireDocument(documentId);
        document.setProcessingStatus(ProcessingStatus.READY);
        document.setChunkCount(chunkCount);
        document.setProcessedAt(LocalDateTime.now());
        document.setProcessingError(null);
        documentRepository.save(document);
    }

    @Transactional
    public void markFailed(UUID documentId, String error) {
        Document document = requireDocument(documentId);
        document.setProcessingStatus(ProcessingStatus.FAILED);
        document.setProcessingError(error);
        document.setProcessedAt(LocalDateTime.now());
        documentRepository.save(document);
    }

    private Document requireDocument(UUID documentId) {
        return documentRepository.findById(documentId)
                .orElseThrow(() -> new ResourceNotFoundException(documentId, "Document"));
    }
}
