package com.evidencepilot.service.impl;

import com.evidencepilot.dto.ExtractionResultPayload;
import com.evidencepilot.service.QdrantClient;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

class QdrantServiceImplTest {

    @Test
    void upsertVectorsWritesOneUuidPointPerChunk() {
        QdrantClient client = mock(QdrantClient.class);
        UUID documentId = UUID.randomUUID();
        UUID chunkId = UUID.randomUUID();
        var chunk = new ExtractionResultPayload.ChunkPayload(
                chunkId, 1, "text", List.of(0.2f), null);

        new QdrantServiceImpl(client)
                .upsertVectors(new ExtractionResultPayload(documentId, List.of(chunk)));

        verify(client).deleteByDocumentId(documentId.toString());
        verify(client).upsertVector(
                eq(chunkId.toString()),
                eq(List.of(0.2f)),
                isNull(),
                argThat(payload -> documentId.toString().equals(payload.get("document_id"))
                        && chunkId.toString().equals(payload.get("chunk_id"))));
    }

    @Test
    void upsertVectorsDoesNothingForEmptyPayload() {
        QdrantClient client = mock(QdrantClient.class);

        new QdrantServiceImpl(client)
                .upsertVectors(new ExtractionResultPayload(UUID.randomUUID(), List.of()));

        verifyNoInteractions(client);
    }

    @Test
    void upsertVectorsRejectsEmptyDenseEmbedding() {
        QdrantClient client = mock(QdrantClient.class);
        UUID chunkId = UUID.randomUUID();
        ExtractionResultPayload payload = new ExtractionResultPayload(
                UUID.randomUUID(),
                List.of(new ExtractionResultPayload.ChunkPayload(
                        chunkId, 0, "text", List.of(), null)));

        assertThatThrownBy(() -> new QdrantServiceImpl(client).upsertVectors(payload))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining(chunkId.toString());
        verifyNoInteractions(client);
    }
}
