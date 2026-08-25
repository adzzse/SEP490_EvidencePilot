package com.evidencepilot.service.impl;

import com.evidencepilot.dto.QdrantSearchResult;
import com.evidencepilot.dto.SparseVector;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.DocumentChunk;
import com.evidencepilot.model.ProjectDocument;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.ProcessingStatus;
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

    @Transactional(readOnly = true)
    public List<List<SourceMatch>> search(UUID projectId, List<String> excerpts, int topK) {
        List<Document> sources = retrievableSources(projectId);
        if (excerpts.isEmpty() || sources.isEmpty()) {
            return excerpts.stream().map(ignored -> List.<SourceMatch>of()).toList();
        }

        Map<UUID, Document> allowedDocuments = new LinkedHashMap<>();
        sources.forEach(document -> allowedDocuments.put(document.getId(), document));
        List<List<Float>> embeddings = aiModelClient.generateEmbeddings(excerpts);
        if (embeddings == null || embeddings.size() != excerpts.size()) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "AI service returned an invalid embedding batch");
        }

        List<String> documentIds = allowedDocuments.keySet().stream()
                .map(UUID::toString)
                .toList();
        List<List<SourceMatch>> results = new ArrayList<>();
        for (int index = 0; index < embeddings.size(); index++) {
            SparseVector sparseQuery = sparseVectorGenerator.generate(excerpts.get(index));
            List<QdrantSearchResult> matches = qdrantClient.findClosestChunks(
                    embeddings.get(index), sparseQuery, documentIds, topK);
            if (matches == null || matches.isEmpty()) {
                results.add(List.of());
                continue;
            }
            results.add(matches.stream()
                    .map(match -> toSourceMatch(match, allowedDocuments))
                    .flatMap(Optional::stream)
                    .toList());
        }
        return List.copyOf(results);
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
    public List<Document> retrievableSources(UUID projectId) {
        return activeSources(projectId).stream()
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
            Map<UUID, Document> allowedDocuments) {
        UUID chunkId;
        try {
            chunkId = UUID.fromString(match.chunkId());
        } catch (IllegalArgumentException exception) {
            log.warn("Qdrant returned invalid chunk id {}, skipping", match.chunkId());
            return Optional.empty();
        }
        return documentChunkRepository.findByIdWithDocument(chunkId)
                .filter(DocumentChunk::isActive)
                .filter(chunk -> chunk.getDocument() != null)
                .filter(chunk -> allowedDocuments.containsKey(chunk.getDocument().getId()))
                .map(chunk -> new SourceMatch(chunk, match.score().floatValue()));
    }

    public record SourceMatch(DocumentChunk chunk, float similarityScore) {
    }
}
