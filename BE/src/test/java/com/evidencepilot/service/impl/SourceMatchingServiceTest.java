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
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SourceMatchingServiceTest {

    private final DocumentRepository documentRepository = mock(DocumentRepository.class);
    private final ProjectDocumentRepository projectDocumentRepository =
            mock(ProjectDocumentRepository.class);
    private final DocumentChunkRepository documentChunkRepository =
            mock(DocumentChunkRepository.class);
    private final AiModelClient aiModelClient = mock(AiModelClient.class);
    private final SparseVectorGenerator sparseVectorGenerator = new SparseVectorGenerator();
    private final QdrantClient qdrantClient = mock(QdrantClient.class);

    @Test
    void activeSourcesKeepsOnlyActiveSourcesAndDeduplicatesProjectMappings() {
        UUID projectId = UUID.randomUUID();
        Document direct = document(DocumentType.SOURCE, true);
        Document linked = document(DocumentType.SOURCE, true);
        Document inactive = document(DocumentType.SOURCE, false);
        Document paper = document(DocumentType.PAPER, true);
        when(documentRepository.findByProjectIdAndDocTypeAndActiveTrue(
                projectId, DocumentType.SOURCE)).thenReturn(List.of(direct));
        when(projectDocumentRepository.findByProjectId(projectId)).thenReturn(List.of(
                mapping(direct),
                mapping(linked),
                mapping(inactive),
                mapping(paper)));

        List<Document> result = service().activeSources(projectId);

        assertThat(result).containsExactly(direct, linked);
    }

    @Test
    void retrievableSourcesExcludesSourcesThatAreNotReady() {
        UUID projectId = UUID.randomUUID();
        Document ready = document(DocumentType.SOURCE, true);
        Document completed = document(DocumentType.SOURCE, true);
        completed.setProcessingStatus(ProcessingStatus.COMPLETED);
        Document processing = document(DocumentType.SOURCE, true);
        processing.setProcessingStatus(ProcessingStatus.PROCESSING);
        when(documentRepository.findByProjectIdAndDocTypeAndActiveTrue(
                projectId, DocumentType.SOURCE))
                .thenReturn(List.of(ready, completed, processing));
        when(projectDocumentRepository.findByProjectId(projectId)).thenReturn(List.of());

        assertThat(service().retrievableSources(projectId)).containsExactly(ready, completed);
    }

    @Test
    void searchDropsQdrantChunksOutsideTheActiveProjectSourceSet() {
        UUID projectId = UUID.randomUUID();
        Document allowedSource = document(DocumentType.SOURCE, true);
        Document foreignSource = document(DocumentType.SOURCE, true);
        DocumentChunk allowedChunk = chunk(allowedSource);
        DocumentChunk foreignChunk = chunk(foreignSource);
        List<String> excerpts = List.of("A project-scoped external benchmark claim");
        List<Float> embedding = List.of(0.1f, 0.2f);
        SparseVector sparseQuery = sparseVectorGenerator.generate(excerpts.getFirst());
        when(documentRepository.findByProjectIdAndDocTypeAndActiveTrue(
                projectId, DocumentType.SOURCE)).thenReturn(List.of(allowedSource));
        when(projectDocumentRepository.findByProjectId(projectId)).thenReturn(List.of());
        when(aiModelClient.generateEmbeddings(excerpts)).thenReturn(List.of(embedding));
        when(qdrantClient.findClosestChunks(
                eq(embedding), eq(sparseQuery),
                eq(List.of(allowedSource.getId().toString())), eq(20)))
                .thenReturn(List.of(
                        new QdrantSearchResult(
                                allowedChunk.getId().toString(), new BigDecimal("0.95")),
                        new QdrantSearchResult(
                                foreignChunk.getId().toString(), new BigDecimal("0.94"))));
        when(documentChunkRepository.findByIdWithDocument(allowedChunk.getId()))
                .thenReturn(Optional.of(allowedChunk));
        when(documentChunkRepository.findByIdWithDocument(foreignChunk.getId()))
                .thenReturn(Optional.of(foreignChunk));

        List<List<SourceMatchingService.SourceMatch>> result =
                service().search(projectId, excerpts, 20);

        assertThat(result).singleElement().satisfies(matches ->
                assertThat(matches).singleElement().satisfies(match -> {
                    assertThat(match.chunk()).isSameAs(allowedChunk);
                    assertThat(match.similarityScore()).isEqualTo(0.95f);
                }));
        verify(qdrantClient).findClosestChunks(
                embedding, sparseQuery, List.of(allowedSource.getId().toString()), 20);
    }

    private SourceMatchingService service() {
        return new SourceMatchingService(
                documentRepository,
                projectDocumentRepository,
                documentChunkRepository,
                aiModelClient,
                sparseVectorGenerator,
                qdrantClient);
    }

    private static ProjectDocument mapping(Document document) {
        ProjectDocument mapping = new ProjectDocument();
        mapping.setDocument(document);
        return mapping;
    }

    private static Document document(DocumentType type, boolean active) {
        Document document = new Document();
        document.setId(UUID.randomUUID());
        document.setDocType(type);
        document.setActive(active);
        document.setProcessingStatus(ProcessingStatus.READY);
        return document;
    }

    private static DocumentChunk chunk(Document document) {
        DocumentChunk chunk = new DocumentChunk();
        chunk.setId(UUID.randomUUID());
        chunk.setActive(true);
        chunk.setDocument(document);
        return chunk;
    }
}
