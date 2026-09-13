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
import com.evidencepilot.repository.PaperReferenceRepository;
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
    private final PaperReferenceRepository paperReferenceRepository =
            mock(PaperReferenceRepository.class);

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
    void retrievableReferenceSourcesExcludesSourcesThatAreNotReady() {
        UUID paperId = UUID.randomUUID();
        Document ready = document(DocumentType.SOURCE, true);
        Document completed = document(DocumentType.SOURCE, true);
        completed.setProcessingStatus(ProcessingStatus.COMPLETED);
        Document processing = document(DocumentType.SOURCE, true);
        processing.setProcessingStatus(ProcessingStatus.PROCESSING);
        when(paperReferenceRepository.findByPaperIdOrderByAddedAtAsc(paperId))
                .thenReturn(List.of(reference(ready), reference(completed), reference(processing)));

        assertThat(service().retrievableReferenceSources(paperId)).containsExactly(ready, completed);
    }

    @Test
    void searchQueriesOnlyRetrievablePaperReferences() {
        UUID paperId = UUID.randomUUID();
        Document allowedSource = document(DocumentType.SOURCE, true);
        Document metadataOnly = document(DocumentType.SOURCE, true);
        metadataOnly.setProcessingStatus(ProcessingStatus.PROCESSING);
        Document foreignSource = document(DocumentType.SOURCE, true);
        DocumentChunk allowedChunk = chunk(allowedSource);
        DocumentChunk foreignChunk = chunk(foreignSource);
        List<String> excerpts = List.of("A project-scoped external benchmark claim");
        List<Float> embedding = List.of(0.1f, 0.2f);
        SparseVector sparseQuery = sparseVectorGenerator.generate(excerpts.getFirst());
        when(paperReferenceRepository.findByPaperIdOrderByAddedAtAsc(paperId))
                .thenReturn(List.of(reference(allowedSource), reference(metadataOnly)));
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
                service().search(paperId, excerpts, 20);

        assertThat(result).singleElement().satisfies(matches ->
                assertThat(matches).singleElement().satisfies(match -> {
                    assertThat(match.chunk()).isSameAs(allowedChunk);
                    assertThat(match.similarityScore()).isEqualTo(0.95f);
                }));
        verify(qdrantClient).findClosestChunks(
                embedding, sparseQuery, List.of(allowedSource.getId().toString()), 20);
    }

    @Test
    void referenceSourcesListsReferencesIncludingMetadataOnly() {
        UUID paperId = UUID.randomUUID();
        Document ready = document(DocumentType.SOURCE, true);
        Document metadataOnly = document(DocumentType.SOURCE, true);
        metadataOnly.setProcessingStatus(ProcessingStatus.PROCESSING);
        when(paperReferenceRepository.findByPaperIdOrderByAddedAtAsc(paperId))
                .thenReturn(List.of(reference(ready), reference(metadataOnly)));

        assertThat(service().referenceSources(paperId)).containsExactly(ready, metadataOnly);
        assertThat(service().retrievableReferenceSources(paperId)).containsExactly(ready);
    }

    private SourceMatchingService service() {
        return new SourceMatchingService(
                documentRepository,
                projectDocumentRepository,
                documentChunkRepository,
                aiModelClient,
                sparseVectorGenerator,
                qdrantClient,
                paperReferenceRepository);
    }

    private static com.evidencepilot.model.PaperReference reference(Document document) {
        com.evidencepilot.model.PaperReference reference = new com.evidencepilot.model.PaperReference();
        reference.setSource(document);
        return reference;
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
