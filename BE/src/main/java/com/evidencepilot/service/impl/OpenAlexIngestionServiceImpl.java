package com.evidencepilot.service.impl;

import com.evidencepilot.client.openalex.DoiUtils;
import com.evidencepilot.client.openalex.OpenAlexClient;
import com.evidencepilot.dto.openalex.OpenAlexWorkResponse;
import com.evidencepilot.dto.response.CitationGraphResponse;
import com.evidencepilot.dto.response.DocumentResponse;
import com.evidencepilot.dto.response.OpenAlexPreview;
import com.evidencepilot.exception.DuplicateProjectDoiException;
import com.evidencepilot.exception.ResourceNotFoundException;
import com.evidencepilot.model.Collection;
import com.evidencepilot.model.CollectionDocument;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.DocumentReference;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.EdgeType;
import com.evidencepilot.model.enums.ProcessingStatus;
import com.evidencepilot.repository.CollectionRepository;
import com.evidencepilot.repository.CollectionDocumentRepository;
import com.evidencepilot.repository.DocumentReferenceRepository;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.ProjectRepository;
import com.evidencepilot.service.CurrentUserService;
import com.evidencepilot.service.DocumentObjectStorage;
import com.evidencepilot.service.OpenAlexIngestionService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class OpenAlexIngestionServiceImpl implements OpenAlexIngestionService {

    private static final byte[] PDF_SIGNATURE = {'%', 'P', 'D', 'F', '-'};
    private static final int PDF_HEADER_SCAN_LIMIT = 1024;
    private static final int MAX_PDF_BYTES = 50 * 1024 * 1024;

    private final OpenAlexClient openAlexClient;
    private final DocumentRepository documentRepository;
    private final ProjectRepository projectRepository;
    private final CollectionRepository collectionRepository;
    private final CollectionDocumentRepository collectionDocumentRepository;
    private final CurrentUserService currentUserService;
    private final DocumentObjectStorage documentObjectStorage;
    private final DocumentPersistenceService documentPersistenceService;
    private final DocumentReferenceRepository documentReferenceRepository;
    private final ObjectMapper objectMapper;
    private final ProjectCollectionService projectCollectionService;

    @Override
    public OpenAlexPreview lookupByDoi(String doi) {
        String normalizedDoi = DoiUtils.normalize(doi);
        if (normalizedDoi == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid DOI: " + doi);
        }
        OpenAlexWorkResponse work = openAlexClient.fetchWork(normalizedDoi);
        String oaUrl = work.oaUrl();
        boolean hasPdf = oaUrl != null && urlIsReachable(oaUrl);
        return new OpenAlexPreview(
                work.title(),
                work.publicationYear(),
                work.publisher(),
                work.authorNames(),
                oaUrl,
                hasPdf
        );
    }

    @Override
    @Transactional
    public DocumentResponse ingestByDoi(UUID projectId, UUID collectionId, String doi) {
        User currentUser = currentUserService.requireCurrentUser();
        String normalizedDoi = DoiUtils.normalize(doi);

        Document document = new Document();
        document.setUploadedBy(currentUser);
        document.setDocType(DocumentType.SOURCE);
        document.setFileUrl("pending");
        document.setContentType("application/pdf");
        document.setFileSizeBytes(0L);
        document.setActive(true);
        document.setCreatedAt(LocalDateTime.now());
        document.setDownloadToken(UUID.randomUUID().toString());

        if (collectionId != null) {
            Collection collection = collectionRepository.findById(collectionId)
                    .orElseThrow(() -> new ResourceNotFoundException(collectionId, "Collection"));
            currentUserService.requireCollectionAccess(currentUser, collection);
            if (DoiUtils.isValid(normalizedDoi)) {
                Document existing = documentRepository.findOwnedActiveSourcesByDoi(
                                currentUser.getId(), DocumentType.SOURCE, normalizedDoi).stream()
                        .findFirst()
                        .orElse(null);
                if (existing != null) {
                    return DocumentResponse.from(projectCollectionService.addSource(
                            existing, collection, currentUser));
                }
            }
            document.setCollection(collection);
        } else if (projectId != null) {
            Project project = projectRepository.findById(projectId)
                    .orElseThrow(() -> new ResourceNotFoundException(projectId, "Project"));
            currentUserService.requireProjectWriteAccess(currentUser, project);
            if (DoiUtils.isValid(normalizedDoi)
                    && documentRepository.countActiveProjectSourcesByDoi(
                            projectId, DocumentType.SOURCE, normalizedDoi) > 0) {
                throw new DuplicateProjectDoiException(normalizedDoi);
            }
            document.setProject(project);
        } else {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Either projectId or collectionId is required");
        }

        OpenAlexWorkResponse work = openAlexClient.fetchWork(normalizedDoi);
        String oaUrl = work.oaUrl();

        document.setOriginalFilename(work.title() != null ? work.title() + ".pdf" : normalizedDoi + ".pdf");
        document.setDoi(normalizedDoi);
        document.setTitle(work.title());
        document.setAuthors(toJson(work.authorNames()));
        document.setPublicationYear(work.publicationYear());
        document.setPublisher(work.publisher());
        document.setCitedByCount(work.citedByCount());

        if (work.primaryTopic() != null) {
            document.setOpenAlexTopic(work.primaryTopic().displayName());
            if (work.primaryTopic().subfield() != null) {
                document.setOpenAlexSubfield(work.primaryTopic().subfield().displayName());
            }
            if (work.primaryTopic().field() != null) {
                document.setOpenAlexField(work.primaryTopic().field().displayName());
            }
            if (work.primaryTopic().domain() != null) {
                document.setOpenAlexDomain(work.primaryTopic().domain().displayName());
            }
        }

        if (oaUrl == null || oaUrl.isBlank()) {
            document.setProcessingStatus(ProcessingStatus.METADATA_FETCHED);
            document.setProcessingError("No open-access PDF available for this DOI");
            document = documentRepository.save(document);
            projectCollectionService.syncSource(document);
            return DocumentResponse.from(document);
        }

        document.setProcessingStatus(ProcessingStatus.METADATA_FETCHED);
        document = documentRepository.save(document);

        String objectKey = "sources/raw/" + document.getId() + ".pdf";
        try (var pdfStream = openAlexClient.downloadPdf(oaUrl)) {
            byte[] pdfBytes = pdfStream.readNBytes(MAX_PDF_BYTES + 1);
            if (pdfBytes.length > MAX_PDF_BYTES) {
                throw new IllegalArgumentException("Downloaded PDF exceeds the 50 MB limit");
            }
            if (!hasPdfSignature(pdfBytes)) {
                throw new IllegalArgumentException(
                        "Downloaded content is not a valid PDF; the publisher may have returned an HTML bot-block page");
            }
            String fileHashSha256 = documentObjectStorage.writeWithSha256(
                    objectKey, pdfBytes, "application/pdf");
            deleteObjectOnRollback(objectKey);
            document.setFileSizeBytes((long) pdfBytes.length);
            document = documentPersistenceService.markDocumentAsUploaded(
                    document.getId(), objectKey, fileHashSha256);
        } catch (Exception e) {
            try {
                documentObjectStorage.delete(objectKey);
            } catch (RuntimeException cleanupFailure) {
                e.addSuppressed(cleanupFailure);
            }
            log.warn("Failed to download PDF from {} for document {}: {}. Metadata saved, user can attach file later.",
                    oaUrl, document.getId(), e.getMessage());
            document.setProcessingStatus(ProcessingStatus.METADATA_FETCHED);
            document.setProcessingError("PDF download not completed: " + e.getMessage() + ". Metadata saved.");
            documentRepository.save(document);
        }

        persistReferences(document, work);
        persistCitedBy(document, work);
        projectCollectionService.syncSource(document);

        return DocumentResponse.from(document);
    }

    private void deleteObjectOnRollback(String objectKey) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                if (status == TransactionSynchronization.STATUS_COMMITTED) {
                    return;
                }
                try {
                    documentObjectStorage.delete(objectKey);
                } catch (RuntimeException e) {
                    log.warn("Failed to delete rolled-back OpenAlex object {}", objectKey, e);
                }
            }
        });
    }

    private static boolean hasPdfSignature(byte[] content) {
        if (content == null || content.length < PDF_SIGNATURE.length) return false;

        int scanLength = Math.min(content.length, PDF_HEADER_SCAN_LIMIT);
        for (int offset = 0; offset <= scanLength - PDF_SIGNATURE.length; offset++) {
            boolean matches = true;
            for (int index = 0; index < PDF_SIGNATURE.length; index++) {
                if (content[offset + index] != PDF_SIGNATURE[index]) {
                    matches = false;
                    break;
                }
            }
            if (matches) return true;
        }
        return false;
    }

    @Override
    @Transactional
    public void persistReferences(UUID documentId) {
        Document document = documentRepository.findById(documentId).orElse(null);
        if (document == null || document.getDoi() == null) return;
        try {
            OpenAlexWorkResponse work = openAlexClient.fetchWork(document.getDoi());
            persistReferences(document, work);
        } catch (Exception e) {
            log.warn("Failed to fetch references for document {}: {}", documentId, e.getMessage());
        }
    }

    private void persistReferences(Document document, OpenAlexWorkResponse work) {
        if (work.referencedWorks() == null || work.referencedWorks().isEmpty()) return;

        UUID documentId = document.getId();
        List<String> collectionDois = List.of();
        if (document.getCollection() != null) {
            collectionDois = documentRepository.findByCollectionId(document.getCollection().getId()).stream()
                    .map(Document::getDoi).filter(java.util.Objects::nonNull).toList();
        }

        List<String> refIds = work.referencedWorks().stream()
                .filter(r -> r != null && !r.isBlank())
                .distinct().toList();
        if (refIds.isEmpty()) return;

        List<OpenAlexWorkResponse> batchResults = openAlexClient.fetchWorksByIds(refIds, "id,doi,title,publication_year,cited_by_count");
        Map<String, OpenAlexWorkResponse> resolved = new LinkedHashMap<>();
        for (OpenAlexWorkResponse r : batchResults) {
            resolved.put(r.id(), r);
        }

        List<DocumentReference> existing = documentReferenceRepository
                .findByDocumentIdAndEdgeTypeOrderByReferenceIndexAsc(documentId, EdgeType.REFERENCES);
        Set<String> existingIds = new HashSet<>();
        int nextIndex = 0;
        for (DocumentReference reference : existing) {
            if (reference.getRawText() != null) existingIds.add(reference.getRawText());
            if (reference.getReferenceIndex() != null) {
                nextIndex = Math.max(nextIndex, reference.getReferenceIndex() + 1);
            }
        }

        List<DocumentReference> pending = new ArrayList<>();
        for (String refId : refIds) {
            if (existingIds.contains(refId)) continue;

            OpenAlexWorkResponse refWork = resolved.get(refId);
            if (refWork == null) {
                DocumentReference ref = new DocumentReference();
                ref.setDocument(document);
                ref.setReferenceIndex(nextIndex++);
                ref.setRawText(refId);
                ref.setEdgeType(EdgeType.REFERENCES);
                pending.add(ref);
                existingIds.add(refId);
                continue;
            }

            if (refWork.doi() != null && collectionDois.contains(refWork.doi())) continue;

            DocumentReference ref = new DocumentReference();
            ref.setDocument(document);
            ref.setReferenceIndex(nextIndex++);
            ref.setRawText(refId);
            ref.setTitle(refWork.title());
            ref.setPublicationYear(refWork.publicationYear());
            ref.setDoi(refWork.doi() != null ? refWork.doi() : null);
            ref.setCitedByCount(refWork.citedByCount());
            ref.setEdgeType(EdgeType.REFERENCES);
            pending.add(ref);
            existingIds.add(refId);
        }
        if (!pending.isEmpty()) documentReferenceRepository.saveAll(pending);
    }

    @Override
    @Transactional
    public void persistCitedBy(UUID documentId) {
        Document document = documentRepository.findById(documentId).orElse(null);
        if (document == null || document.getDoi() == null) return;
        try {
            OpenAlexWorkResponse work = openAlexClient.fetchWork(document.getDoi());
            persistCitedBy(document, work);
        } catch (Exception e) {
            log.warn("Failed to fetch work for cited-by on document {}: {}", documentId, e.getMessage());
        }
    }

    private void persistCitedBy(Document document, OpenAlexWorkResponse work) {
        String openAlexId = work.id();
        if (openAlexId == null) return;

        UUID documentId = document.getId();
        List<String> collectionDois = List.of();
        if (document.getCollection() != null) {
            collectionDois = documentRepository.findByCollectionId(document.getCollection().getId()).stream()
                    .map(Document::getDoi).filter(java.util.Objects::nonNull).toList();
        }

        List<OpenAlexWorkResponse> citingWorks;
        try {
            citingWorks = openAlexClient.fetchCitedByWorks(openAlexId, 5);
        } catch (Exception e) {
            log.warn("Failed to fetch cited-by works for {}: {}", openAlexId, e.getMessage());
            return;
        }

        List<DocumentReference> existing = documentReferenceRepository
                .findByDocumentIdAndEdgeTypeOrderByReferenceIndexAsc(documentId, EdgeType.CITED_BY);
        Set<String> existingIds = new HashSet<>();
        int nextIndex = 0;
        for (DocumentReference reference : existing) {
            if (reference.getRawText() != null) existingIds.add(reference.getRawText());
            if (reference.getReferenceIndex() != null) {
                nextIndex = Math.max(nextIndex, reference.getReferenceIndex() + 1);
            }
        }

        List<DocumentReference> pending = new ArrayList<>();
        for (OpenAlexWorkResponse citing : citingWorks) {
            if (citing.doi() != null && collectionDois.contains(citing.doi())) continue;

            String citingId = citing.id();
            if (citingId == null || citingId.isBlank() || existingIds.contains(citingId)) continue;

            DocumentReference ref = new DocumentReference();
            ref.setDocument(document);
            ref.setReferenceIndex(nextIndex++);
            ref.setRawText(citingId);
            ref.setTitle(citing.title());
            ref.setPublicationYear(citing.publicationYear());
            ref.setDoi(citing.doi());
            ref.setCitedByCount(citing.citedByCount());
            ref.setEdgeType(EdgeType.CITED_BY);
            pending.add(ref);
            existingIds.add(citingId);
        }
        if (!pending.isEmpty()) documentReferenceRepository.saveAll(pending);
    }

    @Override
    @Transactional(readOnly = true)
    public CitationGraphResponse getCitationGraph(UUID collectionId, boolean includeFailed) {
        User currentUser = currentUserService.requireCurrentUser();
        Collection collection = collectionRepository.findById(collectionId)
                .orElseThrow(() -> new ResourceNotFoundException(collectionId, "Collection"));
        currentUserService.requireCollectionAccess(currentUser, collection);

        List<Document> collectionDocuments = collectionDocuments(collectionId);
        List<Document> docs;
        if (includeFailed) {
            docs = collectionDocuments;
        } else {
            docs = collectionDocuments.stream()
                    .filter(d -> d.getProcessingStatus() != ProcessingStatus.FAILED)
                    .toList();
        }

        List<CitationGraphResponse.GraphNode> nodes = new ArrayList<>();
        List<CitationGraphResponse.GraphEdge> edges = new ArrayList<>();
        java.util.Map<String, CitationGraphResponse.GraphNode> externalNodes = new LinkedHashMap<>();

        int maxPerDoc = 20;

        for (Document doc : docs) {
            String docId = doc.getId().toString();
            nodes.add(new CitationGraphResponse.GraphNode(
                    docId, doc.getDoi(), doc.getTitle(), doc.getAuthors(),
                    doc.getPublicationYear(), true,
                    doc.getCitedByCount(), doc.getDoi() != null));

            for (EdgeType edgeType : List.of(EdgeType.REFERENCES, EdgeType.CITED_BY)) {
                List<DocumentReference> refs = documentReferenceRepository
                        .findByDocumentIdAndEdgeTypeOrderByReferenceIndexAsc(doc.getId(), edgeType);

                int count = 0;
                for (DocumentReference ref : refs) {
                    if (count++ >= maxPerDoc) break;
                    String refId = ref.getRawText();
                    String edgeLabel = edgeType.name();
                    edges.add(new CitationGraphResponse.GraphEdge(docId, refId, edgeLabel));

                    if (!externalNodes.containsKey(refId)) {
                        externalNodes.put(refId, new CitationGraphResponse.GraphNode(
                                refId, ref.getDoi(), ref.getTitle(), null,
                                ref.getPublicationYear(), false,
                                ref.getCitedByCount(), ref.getDoi() != null));
                    }
                }
            }
        }

        nodes.addAll(externalNodes.values());
        return new CitationGraphResponse(nodes, edges);
    }

    private List<Document> collectionDocuments(UUID collectionId) {
        Map<UUID, Document> documents = new LinkedHashMap<>();
        documentRepository.findByCollectionId(collectionId)
                .forEach(document -> documents.put(document.getId(), document));
        collectionDocumentRepository.findByCollectionId(collectionId).stream()
                .map(CollectionDocument::getDocument)
                .forEach(document -> documents.put(document.getId(), document));
        return List.copyOf(documents.values());
    }

    protected boolean urlIsReachable(String url) {
        var client = java.net.http.HttpClient.newHttpClient();
        var userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
        try {
            var headReq = java.net.http.HttpRequest.newBuilder()
                    .uri(java.net.URI.create(url))
                    .method("HEAD", java.net.http.HttpRequest.BodyPublishers.noBody())
                    .header("User-Agent", userAgent)
                    .timeout(java.time.Duration.ofSeconds(10))
                    .build();
            var response = client.send(headReq, java.net.http.HttpResponse.BodyHandlers.discarding());
            if (response.statusCode() >= 200 && response.statusCode() < 400) {
                return true;
            }
        } catch (Exception e) {
            log.warn("HEAD request failed for {}: {}", url, e.getMessage());
        }
        try {
            var getReq = java.net.http.HttpRequest.newBuilder()
                    .uri(java.net.URI.create(url))
                    .header("User-Agent", userAgent)
                    .timeout(java.time.Duration.ofSeconds(10))
                    .build();
            var response = client.send(getReq, java.net.http.HttpResponse.BodyHandlers.discarding());
            return response.statusCode() >= 200 && response.statusCode() < 400;
        } catch (Exception e) {
            log.warn("GET request also failed for {}: {}", url, e.getMessage());
            return false;
        }
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            log.warn("Failed to serialize to JSON, storing as string", e);
            return String.valueOf(value);
        }
    }
}
