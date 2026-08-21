package com.evidencepilot.service.impl;

import com.evidencepilot.service.QdrantClient;
import com.evidencepilot.dto.ExtractionResultPayload;
import com.evidencepilot.service.QdrantService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.UUID;

import java.util.Map;

import static java.util.Map.entry;

@Service
@RequiredArgsConstructor
@Slf4j
public class QdrantServiceImpl implements QdrantService {

    private final QdrantClient qdrantClient;

    @Override
    public void upsertVectors(ExtractionResultPayload payload) {
        if (payload.chunks().isEmpty()) {
            return;
        }
        for (ExtractionResultPayload.ChunkPayload chunk : payload.chunks()) {
            if (chunk.denseEmbedding() == null || chunk.denseEmbedding().isEmpty()) {
                throw new IllegalStateException("Chunk " + chunk.chunkId() + " has empty dense embedding");
            }
        }

        qdrantClient.deleteByDocumentId(payload.documentId().toString());
        int upserted = 0;
        for (ExtractionResultPayload.ChunkPayload chunk : payload.chunks()) {
            qdrantClient.upsertVector(
                    chunk.chunkId().toString(),
                    chunk.denseEmbedding(),
                    chunk.sparseEmbedding(),
                    Map.ofEntries(
                            entry("document_id", payload.documentId().toString()),
                            entry("chunk_id", chunk.chunkId().toString()),
                            entry("chunk_index", chunk.chunkIndex()),
                            entry("text", chunk.text())
                    )
            );
            upserted++;
        }
        log.info("Upserted {} vectors to Qdrant for document {}", upserted, payload.documentId());
    }

    @Override
    public void deleteVectors(UUID documentId) {
        qdrantClient.deleteByDocumentId(documentId.toString());
    }
}
