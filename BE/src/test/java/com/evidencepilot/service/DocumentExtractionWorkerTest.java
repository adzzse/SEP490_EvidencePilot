package com.evidencepilot.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.evidencepilot.dto.ExtractionResultPayload;
import com.evidencepilot.dto.SparseVector;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.DocumentChunk;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.service.impl.DocumentExtractionWorkerImpl;
import com.evidencepilot.service.impl.DocumentPersistenceService;
import com.evidencepilot.service.impl.SparseVectorGenerator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DocumentExtractionWorkerTest {

    @Mock
    private DocumentRepository documentRepository;
    @Mock
    private DocumentObjectStorage documentObjectStorage;
    @Mock
    private AiModelClient aiModelClient;
    @Mock
    private SparseVectorGenerator sparseVectorGenerator;
    @Mock
    private QdrantService qdrantService;
    @Mock
    private DocumentPersistenceService persistence;
    @Mock
    private MediaAssetService mediaAssetService;
    @Mock
    private PaperProcessingService paperProcessingService;

    @BeforeEach
    void allowQueuedClaim() {
        when(persistence.markProcessing(any(UUID.class))).thenReturn(true);
    }

    @Test
    void processSkipsDuplicateMessageAfterDocumentLeavesQueue() {
        UUID documentId = UUID.randomUUID();
        when(persistence.markProcessing(documentId)).thenReturn(false);

        worker().process(documentId);

        verify(documentRepository, never()).findById(documentId);
        verify(aiModelClient, never()).extractDocument(any(), any());
    }

    @Test
    void processImportsProjectSourcePdfImagesBeforeWritingCheckpointAndDeletesArchive() throws IOException {
        UUID documentId = UUID.randomUUID();
        Document document = projectSourceDocument(documentId);
        String markdown = "Extracted source.";
        String checkpointKey = "documents/processed/" + documentId + "/extraction.json";
        TestBundle archive = bundleWithImage(markdown);
        DocumentChunk chunk = chunk(document, markdown);

        when(documentRepository.findById(documentId)).thenReturn(Optional.of(document));
        when(documentObjectStorage.exists(checkpointKey)).thenReturn(false);
        when(aiModelClient.extractDocument(eq("source.pdf"), anyString())).thenReturn(archive.bundle());
        when(aiModelClient.generateEmbeddings(List.of(markdown)))
                .thenReturn(List.of(Collections.nCopies(768, 0.1f)));
        when(sparseVectorGenerator.generate(markdown))
                .thenReturn(new SparseVector(List.of(), List.of()));
        when(persistence.saveExtraction(documentId, "mineru", markdown, List.of(markdown)))
                .thenReturn(List.of(chunk));

        worker().process(documentId);

        InOrder order = inOrder(mediaAssetService, documentObjectStorage);
        order.verify(mediaAssetService).importExtractedImage(
                eq(document), eq("images/figure.jpg"), any(), eq(3L), eq("image/jpeg"));
        order.verify(documentObjectStorage).write(
                eq(checkpointKey), any(byte[].class), eq("application/json"));
        assertThat(Files.exists(archive.path())).isFalse();
    }

    @Test
    void processDoesNotImportImagesForCollectionOnlyOrPaperDocuments() throws IOException {
        for (DocumentType docType : List.of(DocumentType.SOURCE, DocumentType.PAPER)) {
            UUID documentId = UUID.randomUUID();
            Document document = document(documentId);
            document.setDocType(docType);
            if (docType == DocumentType.SOURCE) {
                document.setCollection(new com.evidencepilot.model.Collection());
            }
            String markdown = "Extracted source.";
            String checkpointKey = "documents/processed/" + documentId + "/extraction.json";
            TestBundle archive = bundleWithImage(markdown);
            DocumentChunk chunk = chunk(document, markdown);

            when(documentRepository.findById(documentId)).thenReturn(Optional.of(document));
            when(documentObjectStorage.exists(checkpointKey)).thenReturn(false);
            when(aiModelClient.extractDocument(eq("source.pdf"), anyString())).thenReturn(archive.bundle());
            when(aiModelClient.generateEmbeddings(List.of(markdown)))
                    .thenReturn(List.of(Collections.nCopies(768, 0.1f)));
            when(sparseVectorGenerator.generate(markdown))
                    .thenReturn(new SparseVector(List.of(), List.of()));
            when(persistence.saveExtraction(documentId, "mineru", markdown, List.of(markdown)))
                    .thenReturn(List.of(chunk));

            worker().process(documentId);
        }

        verify(mediaAssetService, never()).importExtractedImage(
                any(), anyString(), any(), any(Long.class), anyString());
    }

    @Test
    void processExtractsChunksEmbedsAndMarksReadyAfterQdrant() {
        UUID documentId = UUID.randomUUID();
        Document document = document(documentId);
        document.setFileHashSha256("file-hash");
        String markdown = "First paragraph.\n\nSecond paragraph.";
        String checkpointKey = "documents/processed/" + documentId + "/file-hash/extraction.json";
        List<Float> vector = Collections.nCopies(768, 0.1f);
        DocumentChunk chunk = chunk(document, markdown);
        ExtractionBundle extractedBundle = bundle(markdown);

        when(documentRepository.findById(documentId)).thenReturn(Optional.of(document));
        when(documentObjectStorage.exists(checkpointKey)).thenReturn(false);
        when(aiModelClient.extractDocument(eq("source.pdf"), anyString()))
                .thenReturn(extractedBundle);
        when(aiModelClient.generateEmbeddings(List.of(markdown))).thenReturn(List.of(vector));
        when(sparseVectorGenerator.generate(markdown))
                .thenReturn(new SparseVector(List.of(1L), List.of(0.5f)));
        when(persistence.saveExtraction(documentId, "mineru", markdown, List.of(markdown)))
                .thenReturn(List.of(chunk));

        worker().process(documentId);

        verify(persistence).markProcessing(documentId);
        verify(documentObjectStorage).write(eq(checkpointKey), any(byte[].class), eq("application/json"));
        verify(documentObjectStorage, never()).exists("documents/processed/" + documentId + "/document.md");
        ArgumentCaptor<ExtractionResultPayload> payload = ArgumentCaptor.forClass(ExtractionResultPayload.class);
        InOrder completion = inOrder(qdrantService, persistence);
        completion.verify(qdrantService).upsertVectors(payload.capture());
        completion.verify(persistence).markReady(documentId, 1);
        assertThat(payload.getValue().chunks().getFirst().denseEmbedding()).hasSize(768);
    }

    @Test
    void processReusesExtractionCheckpointOnRetry() throws Exception {
        UUID documentId = UUID.randomUUID();
        Document document = document(documentId);
        String markdown = "cached markdown";
        String checkpointKey = "documents/processed/" + documentId + "/extraction.json";
        DocumentChunk chunk = chunk(document, markdown);

        when(documentRepository.findById(documentId)).thenReturn(Optional.of(document));
        when(documentObjectStorage.exists(checkpointKey)).thenReturn(true);
        when(documentObjectStorage.readText(checkpointKey))
                .thenReturn(new ObjectMapper().writeValueAsString(extracted(markdown)));
        when(aiModelClient.generateEmbeddings(any())).thenReturn(List.of(Collections.nCopies(768, 0.1f)));
        when(sparseVectorGenerator.generate(markdown))
                .thenReturn(new SparseVector(List.of(), List.of()));
        when(persistence.saveExtraction(documentId, "mineru", markdown, List.of(markdown)))
                .thenReturn(List.of(chunk));

        worker().process(documentId);

        verify(aiModelClient, never()).extractDocument(any(), any());
        verify(mediaAssetService, never()).importExtractedImage(
                any(), anyString(), any(), any(Long.class), anyString());
        verify(persistence).markReady(documentId, 1);
    }

    @Test
    void processReusesExtractionBundleAcrossDocumentsWithTheSamePdfHash() throws Exception {
        UUID firstId = UUID.randomUUID();
        UUID secondId = UUID.randomUUID();
        Document first = projectSourceDocument(firstId);
        Document second = projectSourceDocument(secondId);
        String hash = "a".repeat(64);
        first.setFileHashSha256(hash);
        second.setFileHashSha256(hash);
        String firstCheckpoint = DocumentObjectStorage.extractionCheckpointKey(firstId, hash);
        String secondCheckpoint = DocumentObjectStorage.extractionCheckpointKey(secondId, hash);
        String cacheKey = DocumentObjectStorage.extractionCacheKey(hash);
        String markdown = "Extracted source.";
        TestBundle archive = bundleWithImage(markdown);
        AtomicReference<byte[]> cachedBundle = new AtomicReference<>();

        when(documentRepository.findById(firstId)).thenReturn(Optional.of(first));
        when(documentRepository.findById(secondId)).thenReturn(Optional.of(second));
        when(documentObjectStorage.exists(firstCheckpoint)).thenReturn(false);
        when(documentObjectStorage.exists(secondCheckpoint)).thenReturn(false);
        when(documentObjectStorage.exists(cacheKey)).thenReturn(false, true);
        when(aiModelClient.extractDocument(eq("source.pdf"), anyString()))
                .thenReturn(archive.bundle());
        doAnswer(invocation -> {
            try (InputStream content = invocation.getArgument(1)) {
                cachedBundle.set(content.readAllBytes());
            }
            return null;
        }).when(documentObjectStorage).write(
                eq(cacheKey), any(InputStream.class), anyLong(), eq("application/zip"));
        when(documentObjectStorage.getStream(cacheKey))
                .thenAnswer(invocation -> new ByteArrayInputStream(cachedBundle.get()));
        when(aiModelClient.generateEmbeddings(List.of(markdown)))
                .thenReturn(List.of(Collections.nCopies(768, 0.1f)));
        when(sparseVectorGenerator.generate(markdown))
                .thenReturn(new SparseVector(List.of(), List.of()));
        when(persistence.saveExtraction(firstId, "mineru", markdown, List.of(markdown)))
                .thenReturn(List.of(chunk(first, markdown)));
        when(persistence.saveExtraction(secondId, "mineru", markdown, List.of(markdown)))
                .thenReturn(List.of(chunk(second, markdown)));

        DocumentExtractionWorkerImpl worker = worker();
        worker.process(firstId);
        worker.process(secondId);

        verify(aiModelClient, times(1)).extractDocument(eq("source.pdf"), anyString());
        verify(documentObjectStorage, times(1)).write(
                eq(cacheKey), any(InputStream.class), anyLong(), eq("application/zip"));
        verify(documentObjectStorage).getStream(cacheKey);
        verify(documentObjectStorage).write(
                eq(firstCheckpoint), any(byte[].class), eq("application/json"));
        verify(documentObjectStorage).write(
                eq(secondCheckpoint), any(byte[].class), eq("application/json"));
        verify(mediaAssetService, times(2)).importExtractedImage(
                any(Document.class), eq("images/figure.jpg"), any(InputStream.class),
                eq(3L), eq("image/jpeg"));
        assertThat(cachedBundle.get()).isNotEmpty();
        assertThat(Files.exists(archive.path())).isFalse();
    }

    @Test
    void processReextractsWhenCheckpointIsInvalid() {
        UUID documentId = UUID.randomUUID();
        Document document = document(documentId);
        String markdown = "fresh markdown";
        String checkpointKey = "documents/processed/" + documentId + "/extraction.json";
        DocumentChunk chunk = chunk(document, markdown);
        ExtractionBundle extractedBundle = bundle(markdown);

        when(documentRepository.findById(documentId)).thenReturn(Optional.of(document));
        when(documentObjectStorage.exists(checkpointKey)).thenReturn(true);
        when(documentObjectStorage.readText(checkpointKey)).thenReturn(
                "{\"filename\":\"source.pdf\",\"method\":\"mineru\",\"markdown\":\"legacy\"}");
        when(aiModelClient.extractDocument(eq("source.pdf"), anyString()))
                .thenReturn(extractedBundle);
        when(aiModelClient.generateEmbeddings(List.of(markdown)))
                .thenReturn(List.of(Collections.nCopies(768, 0.1f)));
        when(sparseVectorGenerator.generate(markdown))
                .thenReturn(new SparseVector(List.of(), List.of()));
        when(persistence.saveExtraction(documentId, "mineru", markdown, List.of(markdown)))
                .thenReturn(List.of(chunk));

        worker().process(documentId);

        verify(aiModelClient).extractDocument(eq("source.pdf"), anyString());
        verify(documentObjectStorage).write(eq(checkpointKey), any(byte[].class), eq("application/json"));
    }

    @Test
    void processReextractsWhenCheckpointContainsNullBlock() {
        UUID documentId = UUID.randomUUID();
        Document document = document(documentId);
        String markdown = "fresh markdown";
        String checkpointKey = "documents/processed/" + documentId + "/extraction.json";
        DocumentChunk chunk = chunk(document, markdown);
        ExtractionBundle extractedBundle = bundle(markdown);

        when(documentRepository.findById(documentId)).thenReturn(Optional.of(document));
        when(documentObjectStorage.exists(checkpointKey)).thenReturn(true);
        when(documentObjectStorage.readText(checkpointKey)).thenReturn(
                "{\"markdown\":\"broken\",\"blocks\":[null]}");
        when(aiModelClient.extractDocument(eq("source.pdf"), anyString()))
                .thenReturn(extractedBundle);
        when(aiModelClient.generateEmbeddings(List.of(markdown)))
                .thenReturn(List.of(Collections.nCopies(768, 0.1f)));
        when(sparseVectorGenerator.generate(markdown))
                .thenReturn(new SparseVector(List.of(), List.of()));
        when(persistence.saveExtraction(documentId, "mineru", markdown, List.of(markdown)))
                .thenReturn(List.of(chunk));

        worker().process(documentId);

        verify(aiModelClient).extractDocument(eq("source.pdf"), anyString());
        verify(documentObjectStorage).write(eq(checkpointKey), any(byte[].class), eq("application/json"));
    }

    @ParameterizedTest
    @CsvSource({
            "source.docx, python-docx",
            "source.md, markdown",
            "source.markdown, markdown"
    })
    void processPersistsExtractionMethodForNonPdfFormats(
            String filename,
            String extractionMethod) {
        UUID documentId = UUID.randomUUID();
        Document document = document(documentId);
        document.setOriginalFilename(filename);
        String markdown = "Extracted source.";
        String checkpointKey = "documents/processed/" + documentId + "/extraction.json";
        List<Float> vector = Collections.nCopies(768, 0.1f);
        DocumentChunk chunk = chunk(document, markdown);
        ExtractionBundle extractedBundle = bundle(markdown);

        when(documentRepository.findById(documentId)).thenReturn(Optional.of(document));
        when(documentObjectStorage.exists(checkpointKey)).thenReturn(false);
        when(aiModelClient.extractDocument(eq(filename), anyString()))
                .thenReturn(extractedBundle);
        when(aiModelClient.generateEmbeddings(List.of(markdown))).thenReturn(List.of(vector));
        when(sparseVectorGenerator.generate(markdown))
                .thenReturn(new SparseVector(List.of(), List.of()));
        when(persistence.saveExtraction(
                documentId,
                extractionMethod,
                markdown,
                List.of(markdown)))
                .thenReturn(List.of(chunk));

        worker().process(documentId);

        verify(persistence).saveExtraction(
                documentId,
                extractionMethod,
                markdown,
                List.of(markdown));
    }

    @Test
    void processPaperDetectsSectionsAfterQdrantBeforeReady() {
        UUID documentId = UUID.randomUUID();
        Document document = document(documentId);
        document.setDocType(DocumentType.PAPER);
        document.setOriginalFilename("paper.pdf");
        String markdown = "Introduction\n\nPaper content.";
        String checkpointKey = "documents/processed/" + documentId + "/extraction.json";
        DocumentChunk chunk = chunk(document, markdown);
        ExtractionBundle extractedBundle = bundle(markdown);

        when(documentRepository.findById(documentId)).thenReturn(Optional.of(document));
        when(documentObjectStorage.exists(checkpointKey)).thenReturn(false);
        when(aiModelClient.extractDocument(eq("paper.pdf"), anyString()))
                .thenReturn(extractedBundle);
        when(aiModelClient.generateEmbeddings(List.of(markdown)))
                .thenReturn(List.of(Collections.nCopies(768, 0.1f)));
        when(sparseVectorGenerator.generate(markdown))
                .thenReturn(new SparseVector(List.of(), List.of()));
        when(persistence.saveExtraction(documentId, "mineru", markdown, List.of(markdown)))
                .thenReturn(List.of(chunk));

        worker().process(documentId);

        InOrder completion = inOrder(qdrantService, paperProcessingService, persistence);
        completion.verify(qdrantService).upsertVectors(any(ExtractionResultPayload.class));
        completion.verify(paperProcessingService).detectAndPersistSections(
                documentId, extracted(markdown).blocks());
        completion.verify(persistence).markReady(documentId, 1);
    }

    @Test
    void processLatexPaperPersistsSectionsWithoutAiExtraction() {
        UUID documentId = UUID.randomUUID();
        Document document = document(documentId);
        document.setDocType(DocumentType.PAPER);
        document.setOriginalFilename("paper.tex");
        document.setFileUrl("sources/raw/" + documentId + ".tex");
        String latex = "\\section{Introduction}\nPaper content.";

        when(documentRepository.findById(documentId)).thenReturn(Optional.of(document));
        when(documentObjectStorage.readText(document.getFileUrl())).thenReturn(latex);

        worker().process(documentId);

        InOrder completion = inOrder(persistence, paperProcessingService);
        completion.verify(persistence).saveExtraction(documentId, "latex", latex, List.of());
        completion.verify(paperProcessingService).detectAndPersistSections(documentId);
        completion.verify(persistence).markReady(documentId, 0);
        verify(aiModelClient, never()).extractDocument(any(), any());
        verify(aiModelClient, never()).generateEmbeddings(any());
        verify(qdrantService, never()).upsertVectors(any());
        verify(sparseVectorGenerator, never()).generate(any());
    }

    @Test
    void processDoesNotDetectSectionsForNonPaperDocuments() {
        UUID documentId = UUID.randomUUID();
        Document document = document(documentId);
        document.setDocType(DocumentType.SOURCE);
        String markdown = "Extracted source.";
        String checkpointKey = "documents/processed/" + documentId + "/extraction.json";
        DocumentChunk chunk = chunk(document, markdown);
        ExtractionBundle extractedBundle = bundle(markdown);

        when(documentRepository.findById(documentId)).thenReturn(Optional.of(document));
        when(documentObjectStorage.exists(checkpointKey)).thenReturn(false);
        when(aiModelClient.extractDocument(eq("source.pdf"), anyString()))
                .thenReturn(extractedBundle);
        when(aiModelClient.generateEmbeddings(List.of(markdown)))
                .thenReturn(List.of(Collections.nCopies(768, 0.1f)));
        when(sparseVectorGenerator.generate(markdown))
                .thenReturn(new SparseVector(List.of(), List.of()));
        when(persistence.saveExtraction(documentId, "mineru", markdown, List.of(markdown)))
                .thenReturn(List.of(chunk));

        worker().process(documentId);

        verify(paperProcessingService, never()).detectAndPersistSections(any());
        verify(paperProcessingService, never()).detectAndPersistSections(any(), any());
    }

    @Test
    void processReturnsFailedExtractionToQueueForListenerRetry() {
        UUID documentId = UUID.randomUUID();
        Document document = document(documentId);
        when(documentRepository.findById(documentId)).thenReturn(Optional.of(document));
        when(documentObjectStorage.exists(any())).thenReturn(false);
        when(aiModelClient.extractDocument(eq("source.pdf"), anyString()))
                .thenThrow(new AiModelClient.AiApiException("/extract", 503));
        when(persistence.markQueuedForRetry(documentId)).thenReturn(true);

        assertThatThrownBy(() -> worker().process(documentId))
                .isInstanceOf(AiModelClient.AiApiException.class);

        verify(persistence).markQueuedForRetry(documentId);
        verify(persistence, never()).markFailed(eq(documentId), any());
        verify(persistence, never()).markReady(any(), any(Integer.class));
    }

    private DocumentExtractionWorkerImpl worker() {
        var w = new DocumentExtractionWorkerImpl(
                documentRepository,
                documentObjectStorage,
                aiModelClient,
                sparseVectorGenerator,
                qdrantService,
                persistence,
                new ObjectMapper(),
                mediaAssetService,
                paperProcessingService);
        ReflectionTestUtils.setField(w, "baseUrl", "http://localhost:8080");
        return w;
    }

    private static Document document(UUID id) {
        Document document = new Document();
        document.setId(id);
        document.setFileUrl("sources/raw/" + id + ".pdf");
        document.setOriginalFilename("source.pdf");
        document.setContentType("application/pdf");
        document.setDownloadToken(UUID.randomUUID().toString());
        return document;
    }

    private static Document projectSourceDocument(UUID id) {
        Document document = document(id);
        Project project = new Project();
        project.setId(UUID.randomUUID());
        User user = new User();
        user.setId(UUID.randomUUID());
        document.setProject(project);
        document.setUploadedBy(user);
        document.setDocType(DocumentType.SOURCE);
        return document;
    }

    private static DocumentChunk chunk(Document document, String text) {
        DocumentChunk chunk = new DocumentChunk();
        chunk.setId(UUID.randomUUID());
        chunk.setDocument(document);
        chunk.setChunkIndex(0);
        chunk.setText(text);
        chunk.setActive(true);
        return chunk;
    }

    private static AiModelClient.ExtractedDocument extracted(String markdown) {
        return new AiModelClient.ExtractedDocument(
                markdown,
                List.of(new AiModelClient.ExtractionBlock("paragraph", markdown, null, null)),
                List.of());
    }

    private static ExtractionBundle bundle(String markdown) {
        ExtractionBundle bundle = mock(ExtractionBundle.class);
        when(bundle.document()).thenReturn(extracted(markdown));
        return bundle;
    }

    private static TestBundle bundleWithImage(String markdown) throws IOException {
        Path archive = Files.createTempFile("worker-extraction-", ".zip");
        try (ZipOutputStream zip = new ZipOutputStream(Files.newOutputStream(archive), StandardCharsets.UTF_8)) {
            zip.putNextEntry(new ZipEntry("extraction.json"));
            zip.write(("{\"blocks\":[{\"type\":\"paragraph\",\"text\":\"" + markdown
                    + "\",\"level\":null,\"caption\":null}],\"images\":[\"images/figure.jpg\"]}")
                    .getBytes(StandardCharsets.UTF_8));
            zip.closeEntry();
            zip.putNextEntry(new ZipEntry("document.md"));
            zip.write(markdown.getBytes(StandardCharsets.UTF_8));
            zip.closeEntry();
            zip.putNextEntry(new ZipEntry("images/figure.jpg"));
            zip.write(new byte[] {1, 2, 3});
            zip.closeEntry();
        }
        return new TestBundle(archive, ExtractionBundle.open(archive));
    }

    private record TestBundle(Path path, ExtractionBundle bundle) {
    }
}
