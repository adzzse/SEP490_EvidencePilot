package com.evidencepilot.service.impl;

import com.evidencepilot.dto.QdrantSearchResult;
import com.evidencepilot.dto.SparseVector;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.DocumentChunk;
import com.evidencepilot.model.PaperReference;
import com.evidencepilot.model.ProjectDocument;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.ProcessingStatus;
import com.evidencepilot.repository.PaperReferenceRepository;
import com.evidencepilot.repository.DocumentChunkRepository;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.ProjectDocumentRepository;
import com.evidencepilot.service.AiModelClient;
import com.evidencepilot.service.QdrantClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

@Service
@RequiredArgsConstructor
@Slf4j
public class SourceMatchingService {

    private static final String CITATION_PREFIX = "ep";

    private final DocumentRepository documentRepository;
    private final ProjectDocumentRepository projectDocumentRepository;
    private final DocumentChunkRepository documentChunkRepository;
    private final AiModelClient aiModelClient;
    private final SparseVectorGenerator sparseVectorGenerator;
    private final QdrantClient qdrantClient;
    private final PaperReferenceRepository paperReferenceRepository;

    @Transactional(readOnly = true)
    public List<List<SourceMatch>> search(UUID paperId, List<String> excerpts, int topK) {
        List<Document> sources = retrievableReferenceSources(paperId);
        if (excerpts.isEmpty() || sources.isEmpty()) {
            return excerpts.stream().map(ignored -> List.<SourceMatch>of()).toList();
        }

        Map<UUID, Document> allowedDocuments = new LinkedHashMap<>();
        sources.forEach(document -> allowedDocuments.put(document.getId(), document));
        long searchStartedNanos = System.nanoTime();
        List<List<Float>> embeddings = aiModelClient.generateEmbeddings(excerpts);
        if (embeddings == null || embeddings.size() != excerpts.size()) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "AI service returned an invalid embedding batch");
        }

        List<String> documentIds = allowedDocuments.keySet().stream()
                .map(UUID::toString)
                .toList();
        // rationale: Qdrant exposes single-query search only — fan the per-query calls
        // out on a bounded pool instead of stacking N sequential round-trips.
        List<List<QdrantSearchResult>> rawMatches = searchChunks(embeddings, excerpts, documentIds, topK);
        // rationale: one chunk query for the whole batch instead of one per hit.
        Map<UUID, DocumentChunk> chunksById = fetchChunks(rawMatches);
        List<List<SourceMatch>> results = new ArrayList<>();
        for (List<QdrantSearchResult> matches : rawMatches) {
            results.add(matches.stream()
                    .map(match -> toSourceMatch(match, chunksById, allowedDocuments))
                    .flatMap(Optional::stream)
                    .toList());
        }
        log.info("Evidence search: queries={} qdrantHits={} chunks={} total={}ms",
                embeddings.size(),
                rawMatches.stream().mapToInt(List::size).sum(),
                chunksById.size(),
                java.util.concurrent.TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - searchStartedNanos));
        return List.copyOf(results);
    }

    private List<List<QdrantSearchResult>> searchChunks(
            List<List<Float>> embeddings, List<String> excerpts, List<String> documentIds, int topK) {
        int parallelism = Math.min(Math.max(1, embeddings.size()), 4);
        ExecutorService fanout = Executors.newFixedThreadPool(parallelism, task -> {
            Thread thread = new Thread(task, "qdrant-search");
            thread.setDaemon(true);
            return thread;
        });
        try {
            List<Future<List<QdrantSearchResult>>> futures = new ArrayList<>();
            for (int index = 0; index < embeddings.size(); index++) {
                final int queryIndex = index;
                futures.add(fanout.submit(() -> {
                    SparseVector sparseQuery = sparseVectorGenerator.generate(excerpts.get(queryIndex));
                    List<QdrantSearchResult> matches = qdrantClient.findClosestChunks(
                            embeddings.get(queryIndex), sparseQuery, documentIds, topK);
                    return matches == null ? List.<QdrantSearchResult>of() : matches;
                }));
            }
            List<List<QdrantSearchResult>> rawMatches = new ArrayList<>();
            for (Future<List<QdrantSearchResult>> future : futures) {
                try {
                    rawMatches.add(future.get());
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    throw new ResponseStatusException(
                            HttpStatus.SERVICE_UNAVAILABLE, "Evidence search interrupted");
                } catch (ExecutionException failed) {
                    Throwable cause = failed.getCause() != null ? failed.getCause() : failed;
                    if (cause instanceof ResponseStatusException status) {
                        throw status;
                    }
                    if (cause instanceof RuntimeException runtime) {
                        throw runtime;
                    }
                    throw new ResponseStatusException(
                            HttpStatus.SERVICE_UNAVAILABLE, "Evidence search failed");
                }
            }
            return rawMatches;
        } finally {
            fanout.shutdownNow();
        }
    }

    private Map<UUID, DocumentChunk> fetchChunks(List<List<QdrantSearchResult>> rawMatches) {
        List<UUID> chunkIds = new ArrayList<>();
        for (List<QdrantSearchResult> matches : rawMatches) {
            for (QdrantSearchResult match : matches) {
                try {
                    UUID chunkId = UUID.fromString(match.chunkId());
                    if (!chunkIds.contains(chunkId)) {
                        chunkIds.add(chunkId);
                    }
                } catch (IllegalArgumentException invalid) {
                    log.warn("Qdrant returned invalid chunk id {}, skipping", match.chunkId());
                }
            }
        }
        if (chunkIds.isEmpty()) {
            return Map.of();
        }
        Map<UUID, DocumentChunk> chunksById = new LinkedHashMap<>();
        documentChunkRepository.findAllById(chunkIds).forEach(chunk -> chunksById.put(chunk.getId(), chunk));
        return chunksById;
    }

    @Transactional(readOnly = true)
    public List<Document> activeSources(UUID projectId) {
        Map<UUID, Document> documents = new LinkedHashMap<>();
        documentRepository.findByProjectIdAndDocTypeAndActiveTrue(projectId, DocumentType.SOURCE)
                .forEach(document -> documents.put(document.getId(), document));
        projectDocumentRepository.findByProjectId(projectId).stream()
                .map(ProjectDocument::getDocument)
                .filter(Document::isActive)
                .filter(document -> document.getDocType() == DocumentType.SOURCE)
                .forEach(document -> documents.put(document.getId(), document));
        return List.copyOf(documents.values());
    }

    @Transactional(readOnly = true)
    public List<Document> referenceSources(UUID paperId) {
        return paperReferenceRepository.findByPaperIdOrderByAddedAtAsc(paperId).stream()
                .map(PaperReference::getSource)
                .filter(source -> source != null && source.isActive()
                        && source.getDocType() == DocumentType.SOURCE)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<Document> retrievableReferenceSources(UUID paperId) {
        return referenceSources(paperId).stream()
                .filter(document -> document.getProcessingStatus() == ProcessingStatus.READY
                        || document.getProcessingStatus() == ProcessingStatus.COMPLETED)
                .toList();
    }

    public static String citationKey(UUID documentId) {
        return CITATION_PREFIX + documentId.toString().replace("-", "");
    }

    public static Optional<UUID> citationDocumentId(String key) {
        if (key == null || !key.toLowerCase(Locale.ROOT).matches("ep[0-9a-f]{32}")) {
            return Optional.empty();
        }
        String value = key.substring(CITATION_PREFIX.length());
        try {
            return Optional.of(UUID.fromString(
                    value.substring(0, 8) + "-" + value.substring(8, 12) + "-"
                            + value.substring(12, 16) + "-" + value.substring(16, 20)
                            + "-" + value.substring(20)));
        } catch (IllegalArgumentException exception) {
            return Optional.empty();
        }
    }

    private Optional<SourceMatch> toSourceMatch(
            QdrantSearchResult match,
            Map<UUID, DocumentChunk> chunksById,
            Map<UUID, Document> allowedDocuments) {
        UUID chunkId;
        try {
            chunkId = UUID.fromString(match.chunkId());
        } catch (IllegalArgumentException exception) {
            return Optional.empty();
        }
        DocumentChunk chunk = chunksById.get(chunkId);
        if (chunk == null) {
            return Optional.empty();
        }
        return Optional.ofNullable(chunk)
                .filter(DocumentChunk::isActive)
                .filter(found -> found.getDocument() != null)
                .filter(found -> allowedDocuments.containsKey(found.getDocument().getId()))
                .map(found -> new SourceMatch(found, match.score().floatValue()));
    }

    public record SourceMatch(DocumentChunk chunk, float similarityScore) {
    }
}
