package com.evidencepilot.service.impl;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.evidencepilot.dto.ExtractionResultPayload;
import com.evidencepilot.dto.SparseVector;
import com.evidencepilot.exception.ResourceNotFoundException;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.DocumentChunk;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.service.AiModelClient;
import com.evidencepilot.service.DocumentExtractionWorker;
import com.evidencepilot.service.DocumentObjectStorage;
import com.evidencepilot.service.ExtractionBundle;
import com.evidencepilot.service.MediaAssetService;
import com.evidencepilot.service.PaperProcessingService;
import com.evidencepilot.service.QdrantService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class DocumentExtractionWorkerImpl implements DocumentExtractionWorker {

    private static final int EMBEDDING_BATCH_SIZE = 32;
    private static final int EMBEDDING_DIMENSION = 768;

    @Value("${app.base-url}")
    private String baseUrl;

    private final DocumentRepository documentRepository;
    private final DocumentObjectStorage documentObjectStorage;
    private final AiModelClient aiModelClient;
    private final SparseVectorGenerator sparseVectorGenerator;
    private final QdrantService qdrantService;
    private final DocumentPersistenceService documentPersistenceService;
    private final ObjectMapper objectMapper;
    private final MediaAssetService mediaAssetService;
    private final PaperProcessingService paperProcessingService;

    @Override
    public void process(UUID documentId) {
        if (!documentPersistenceService.markProcessing(documentId)) {
            log.info("Skipping extraction message for document {} because it is no longer QUEUED", documentId);
            return;
        }
        Document document = documentRepository.findById(documentId)
                .orElseThrow(() -> new ResourceNotFoundException(documentId, "Document"));
        try {
            processDocument(document);
        } catch (RuntimeException e) {
            if (!documentPersistenceService.markQueuedForRetry(documentId)) {
                log.warn("Could not requeue failed extraction for document {}", documentId);
            }
            throw e;
        }
    }

    private void processDocument(Document document) {
        if (isLatexPaper(document)) {
            processLatexPaper(document);
            return;
        }

        String checkpointKey = DocumentObjectStorage.extractionCheckpointKey(
                document.getId(), document.getFileHashSha256());
        AiModelClient.ExtractedDocument extracted = readCheckpoint(checkpointKey);
        if (extracted == null) {
            extracted = extract(document);
            writeCheckpoint(checkpointKey, extracted);
        }

        List<String> chunks = DocumentChunker.chunk(extracted.blocks());
        if (chunks.isEmpty()) {
            throw new DocumentExtractionException("Extraction produced zero chunks");
        }
        List<List<Float>> dense = embed(chunks);
        List<SparseVector> sparse = chunks.stream()
                .map(sparseVectorGenerator::generate)
                .toList();
        List<DocumentChunk> savedChunks = documentPersistenceService.saveExtraction(
                document.getId(),
                extractionMethod(document.getOriginalFilename()),
                extracted.markdown(),
                chunks);
        if (savedChunks.size() != chunks.size()) {
            throw new DocumentExtractionException("Failed to persist every document chunk");
        }

        List<ExtractionResultPayload.ChunkPayload> payloadChunks = new ArrayList<>();
        for (int index = 0; index < savedChunks.size(); index++) {
            DocumentChunk chunk = savedChunks.get(index);
            payloadChunks.add(new ExtractionResultPayload.ChunkPayload(
                    chunk.getId(),
                    chunk.getChunkIndex(),
                    chunk.getText(),
                    dense.get(index),
                    sparse.get(index)));
        }

        qdrantService.upsertVectors(new ExtractionResultPayload(document.getId(), payloadChunks));
        if (document.getDocType() == DocumentType.PAPER) {
            paperProcessingService.detectAndPersistSections(document.getId(), extracted.blocks());
        }
        documentPersistenceService.markReady(document.getId(), payloadChunks.size());
        log.info("Completed extraction for document {} with {} chunks", document.getId(), payloadChunks.size());
    }

    private AiModelClient.ExtractedDocument extract(Document document) {
        String cacheKey = extractionCacheKey(document);
        if (cacheKey != null && documentObjectStorage.exists(cacheKey)) {
            try (InputStream content = documentObjectStorage.getStream(cacheKey);
                    ExtractionBundle bundle = ExtractionBundle.open(content)) {
                log.info("Reusing extraction cache {} for document {}", cacheKey, document.getId());
                return materialize(document, bundle);
            } catch (IOException e) {
                log.warn("Ignoring invalid extraction cache {}", cacheKey, e);
            }
        }

        String downloadUrl = baseUrl + "/api/documents/" + document.getId()
                + "/download?token=" + document.getDownloadToken();
        try (ExtractionBundle bundle = aiModelClient.extractDocument(
                document.getOriginalFilename(), downloadUrl)) {
            AiModelClient.ExtractedDocument extracted = requireValid(bundle.document());
            if (cacheKey != null) {
                writeExtractionCache(cacheKey, bundle);
            }
            return materialize(document, bundle, extracted);
        }
    }

    private AiModelClient.ExtractedDocument materialize(Document document, ExtractionBundle bundle) {
        return materialize(document, bundle, requireValid(bundle.document()));
    }

    private AiModelClient.ExtractedDocument materialize(
            Document document,
            ExtractionBundle bundle,
            AiModelClient.ExtractedDocument extracted) {
        if (document.getProject() == null || !isPdf(document.getOriginalFilename())) {
            return extracted;
        }
        for (String image : extracted.images()) {
            try (InputStream content = bundle.openImage(image)) {
                mediaAssetService.importExtractedImage(
                        document,
                        image,
                        content,
                        bundle.imageSize(image),
                        bundle.imageMediaType(image));
            } catch (IOException e) {
                throw new DocumentExtractionException(
                        "Failed to read extracted image " + image + ": " + e.getMessage());
            }
        }
        if (extracted.images().isEmpty()) {
            return extracted;
        }
        String markdown = extracted.markdown();
        for (String image : extracted.images()) {
            markdown = markdown.replace("![](" + image + ")", "\\includegraphics{" + image + "}");
        }
        return new AiModelClient.ExtractedDocument(markdown, extracted.blocks(), extracted.images());
    }

    private void writeExtractionCache(String cacheKey, ExtractionBundle bundle) {
        try (InputStream content = bundle.openArchive()) {
            documentObjectStorage.write(cacheKey, content, bundle.archiveSize(), "application/zip");
        } catch (IOException e) {
            throw new DocumentExtractionException(
                    "Failed to cache extraction bundle: " + e.getMessage());
        }
    }

    private static AiModelClient.ExtractedDocument requireValid(
            AiModelClient.ExtractedDocument extracted) {
        if (extracted == null || !extracted.valid()) {
            throw new DocumentExtractionException("Extraction returned an invalid document");
        }
        return extracted;
    }

    private static String extractionCacheKey(Document document) {
        String hash = document.getFileHashSha256();
        if (!isPdf(document.getOriginalFilename())
                || hash == null
                || hash.length() != 64
                || !hash.chars().allMatch(character ->
                        character >= '0' && character <= '9'
                                || character >= 'a' && character <= 'f')) {
            return null;
        }
        return DocumentObjectStorage.extractionCacheKey(hash);
    }

    private static boolean isPdf(String filename) {
        return filename != null && filename.toLowerCase(Locale.ROOT).endsWith(".pdf");
    }

    private void processLatexPaper(Document document) {
        String latex = documentObjectStorage.readText(document.getFileUrl());
        if (latex.isBlank()) {
            throw new DocumentExtractionException("LaTeX paper is empty");
        }
        documentPersistenceService.saveExtraction(document.getId(), "latex", latex, List.of());
        paperProcessingService.detectAndPersistSections(document.getId());
        documentPersistenceService.markReady(document.getId(), 0);
        log.info("Completed LaTeX paper processing for document {}", document.getId());
    }

    private static boolean isLatexPaper(Document document) {
        return document.getDocType() == DocumentType.PAPER
                && document.getOriginalFilename() != null
                && document.getOriginalFilename().toLowerCase(Locale.ROOT).endsWith(".tex");
    }

    private static String extractionMethod(String filename) {
        String normalized = filename == null ? "" : filename.toLowerCase(Locale.ROOT);
        if (normalized.endsWith(".pdf")) {
            return "mineru";
        }
        if (normalized.endsWith(".docx")) {
            return "python-docx";
        }
        if (normalized.endsWith(".md") || normalized.endsWith(".markdown")) {
            return "markdown";
        }
        throw new DocumentExtractionException("Unsupported document filename: " + filename);
    }

    private AiModelClient.ExtractedDocument readCheckpoint(String checkpointKey) {
        if (!documentObjectStorage.exists(checkpointKey)) {
            return null;
        }
        try {
            AiModelClient.ExtractedDocument extracted = objectMapper.readValue(
                    documentObjectStorage.readText(checkpointKey),
                    AiModelClient.ExtractedDocument.class);
            if (extracted != null && extracted.valid()) {
                return extracted;
            }
        } catch (JsonProcessingException e) {
            log.warn("Ignoring invalid extraction checkpoint {}", checkpointKey, e);
        }
        return null;
    }

    private void writeCheckpoint(String checkpointKey, AiModelClient.ExtractedDocument extracted) {
        try {
            documentObjectStorage.write(
                    checkpointKey,
                    objectMapper.writeValueAsBytes(extracted),
                    "application/json");
        } catch (JsonProcessingException e) {
            throw new DocumentExtractionException("Failed to serialize extraction checkpoint: " + e.getMessage());
        }
    }

    private List<List<Float>> embed(List<String> chunks) {
        List<List<Float>> embeddings = new ArrayList<>();
        for (int start = 0; start < chunks.size(); start += EMBEDDING_BATCH_SIZE) {
            int end = Math.min(start + EMBEDDING_BATCH_SIZE, chunks.size());
            List<List<Float>> batch = aiModelClient.generateEmbeddings(chunks.subList(start, end));
            if (batch.size() != end - start) {
                throw new DocumentExtractionException("Embedding count does not match chunk count");
            }
            for (List<Float> vector : batch) {
                if (vector.size() != EMBEDDING_DIMENSION) {
                    throw new DocumentExtractionException("Embedding dimension must be " + EMBEDDING_DIMENSION);
                }
            }
            embeddings.addAll(batch);
        }
        return embeddings;
    }

}
