package com.evidencepilot.service;

import com.evidencepilot.dto.QdrantSearchResult;
import com.evidencepilot.dto.SparseVector;

import java.util.List;
import java.util.Map;

public interface QdrantClient {

    void upsertVector(
            String chunkId,
            List<Float> denseVector,
            SparseVector sparseVector,
            Map<String, Object> payload);

    void deleteByDocumentId(String documentId);

    List<QdrantSearchResult> findClosestChunks(
            List<Float> queryVector,
            List<String> documentIds,
            int topK);

    Map<String, Object> health();
}
