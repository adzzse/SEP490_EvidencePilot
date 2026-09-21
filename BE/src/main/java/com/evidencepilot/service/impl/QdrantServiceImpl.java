package com.evidencepilot.service.impl;

import com.evidencepilot.service.QdrantClient;
import com.evidencepilot.dto.ExtractionResultPayload;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.Collection;
import java.util.Map;
import java.util.UUID;

import static java.util.Map.entry;

@Service
@RequiredArgsConstructor
@Slf4j
public class QdrantServiceImpl {

    private final QdrantClient qdrantClient;

    public void upsertVectors(ExtractionResultPayload payload) {
        validateEmbeddings(payload);
        if (payload.chunks().isEmpty()) return;
        qdrantClient.deleteByDocumentId(payload.documentId().toString());
        stageVectors(payload);
    }

    public void stageVectors(ExtractionResultPayload payload) {
        validateEmbeddings(payload);
        if (payload.chunks().isEmpty()) return;
        int upserted = 0;
        for (ExtractionResultPayload.ChunkPayload chunk : payload.chunks()) {
            upsert(payload, chunk);
            upserted++;
        }
        log.info("Upserted {} vectors to Qdrant for document {}", upserted, payload.documentId());
    }

    public void deleteVectors(UUID documentId) {
        qdrantClient.deleteByDocumentId(documentId.toString());
    }

    public void deleteChunkVectors(Collection<UUID> chunkIds) {
        qdrantClient.deleteByChunkIds(chunkIds.stream().map(UUID::toString).toList());
    }

    private static void validateEmbeddings(ExtractionResultPayload payload) {
        for (ExtractionResultPayload.ChunkPayload chunk : payload.chunks()) {
            if (chunk.denseEmbedding() == null || chunk.denseEmbedding().isEmpty()) {
                throw new IllegalStateException("Chunk " + chunk.chunkId() + " has empty dense embedding");
            }
        }
    }

    private void upsert(ExtractionResultPayload payload, ExtractionResultPayload.ChunkPayload chunk) {
        qdrantClient.upsertVector(
                chunk.chunkId().toString(), chunk.denseEmbedding(), chunk.sparseEmbedding(),
                Map.ofEntries(
                        entry("document_id", payload.documentId().toString()),
                        entry("chunk_id", chunk.chunkId().toString()),
                        entry("chunk_index", chunk.chunkIndex()),
                        entry("text", chunk.text())));
    }
}
