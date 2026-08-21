package com.evidencepilot.service.impl;

import com.evidencepilot.dto.response.DocumentChunkResponse;
import com.evidencepilot.dto.response.DocumentResponse;
import com.evidencepilot.dto.response.DocumentTextResponse;
import com.evidencepilot.dto.response.PagedResponse;
import com.evidencepilot.dto.response.SourceLibraryItemResponse;
import com.evidencepilot.exception.ResourceNotFoundException;
import com.evidencepilot.model.Collection;
import com.evidencepilot.model.CollectionDocument;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.DocumentChunk;
import com.evidencepilot.model.DocumentText;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.ProjectDocument;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.ProcessingStatus;
import com.evidencepilot.model.enums.ProjectStatus;
import com.evidencepilot.repository.CollectionRepository;
import com.evidencepilot.repository.CollectionDocumentRepository;
import com.evidencepilot.repository.DocumentChunkRepository;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.DocumentTextRepository;
import com.evidencepilot.repository.PaperSectionRepository;
import com.evidencepilot.repository.ProjectDocumentRepository;
import com.evidencepilot.repository.ProjectRepository;

import com.evidencepilot.client.openalex.OpenAlexClient;
import com.evidencepilot.dto.openalex.OpenAlexWorkResponse;
import com.evidencepilot.service.CurrentUserService;
import com.evidencepilot.service.DocumentObjectStorage;
import com.evidencepilot.service.DocumentService;
import com.evidencepilot.service.MediaAssetService;
import com.evidencepilot.service.QdrantService;
import com.evidencepilot.dto.request.PagingRequest;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Subquery;
import lombok.RequiredArgsConstructor;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class DocumentServiceImpl implements DocumentService {

    private static final Set<String> DOCUMENT_SORT_FIELDS = Set.of(
            "title", "originalFilename", "docType", "processingStatus", "createdAt", "fileSizeBytes");

    private static final int MAX_EXTRACTED_TEXT_LENGTH = 5_000_000;

    private final DocumentRepository documentRepository;
    private final DocumentChunkRepository documentChunkRepository;
    private final DocumentTextRepository documentTextRepository;
    private final ProjectRepository projectRepository;
    private final CollectionRepository collectionRepository;
    private final CollectionDocumentRepository collectionDocumentRepository;
    private final ProjectDocumentRepository projectDocumentRepository;
    private final PaperSectionRepository paperSectionRepository;
    private final CurrentUserService currentUserService;
    private final DocumentPersistenceService documentPersistenceService;
    private final DocumentObjectStorage documentObjectStorage;
    private final MediaAssetService mediaAssetService;
    private final QdrantService qdrantService;
    private final OpenAlexClient openAlexClient;
    private final ObjectMapper objectMapper;
    private final ProjectCollectionService projectCollectionService;

    @Override
    public DocumentResponse getDocumentById(UUID id) {
        var currentUser = currentUserService.requireCurrentUser();
        Document doc = findDocument(id);
        requireDocumentAccess(currentUser, doc);
        return DocumentResponse.from(doc);
    }

    @Override
    public DocumentResponse getSourceById(UUID id) {
        var currentUser = currentUserService.requireCurrentUser();
        Document doc = findDocument(id);
        if (doc.getDocType() != DocumentType.SOURCE || !doc.isActive()) {
            throw new ResourceNotFoundException(id, "Source");
        }
        requireDocumentAccess(currentUser, doc);
        return DocumentResponse.from(doc);
    }

    @Override
    public List<DocumentResponse> getAllPapersForCurrentUser() {
        User currentUser = currentUserService.requireCurrentUser();
        if (currentUserService.isAdmin(currentUser)) {
            return documentRepository.findAll().stream()
                    .filter(d -> d.isActive() && d.getDocType() == DocumentType.PAPER)
                    .map(DocumentResponse::from)
                    .toList();
        }
        return documentRepository.findAll().stream()
                .filter(d -> d.isActive() && d.getDocType() == DocumentType.PAPER
                        && d.getProject() != null && d.getProject().getStudent() != null
                        && d.getProject().getStudent().getId().equals(currentUser.getId()))
                .map(DocumentResponse::from)
                .toList();
    }

    @Override
    public List<DocumentResponse> getDocumentsByProject(UUID projectId) {
        requireProjectAccess(projectId);
        return documentRepository.findByProjectId(projectId).stream()
                .map(DocumentResponse::from)
                .toList();
    }

    @Override
    public PagedResponse<DocumentResponse> getDocumentsByProject(
            UUID projectId,
            int page,
            int size,
            String sort,
            String q,
            DocumentType docType,
            ProcessingStatus processingStatus,
            Boolean active) {
        requireProjectAccess(projectId);
        var pageable = PagingRequest.pageable(
                page, size, sort, DOCUMENT_SORT_FIELDS, "createdAt,desc");
        var results = documentRepository.findAll(
                documentSpec(projectId, docType, processingStatus, active, q),
                pageable);
        return PagedResponse.from(results.map(DocumentResponse::from));
    }

    @Override
    @Transactional(readOnly = true)
    public PagedResponse<DocumentResponse> getSourcesByCollection(
            UUID collectionId, int page, int size, String sort, String q) {
        var currentUser = currentUserService.requireCurrentUser();
        var collection = collectionRepository.findById(collectionId)
                .orElseThrow(() -> new ResourceNotFoundException(collectionId, "Collection"));
        currentUserService.requireCollectionAccess(currentUser, collection);
        var pageable = PagingRequest.pageable(
                page, size, sort, DOCUMENT_SORT_FIELDS, "createdAt,desc");
        var results = documentRepository.findAll(
                collectionSourceSpec(collectionId, q), pageable);
        Map<UUID, List<UUID>> projectIdsByDocument = new LinkedHashMap<>();
        projectDocumentRepository.findByDocumentIdIn(
                        results.getContent().stream().map(Document::getId).toList())
                .forEach(link -> projectIdsByDocument
                        .computeIfAbsent(link.getDocument().getId(), ignored -> new ArrayList<>())
                        .add(link.getProject().getId()));
        var pageContent = results.map(doc -> DocumentResponse.from(
                doc, projectIdsByDocument.getOrDefault(doc.getId(), List.of())));
        return PagedResponse.from(pageContent);
    }

    @Override
    @Transactional(readOnly = true)
    public PagedResponse<DocumentResponse> getAvailableLibrarySources(
            UUID collectionId, int page, int size, String sort, String q) {
        User currentUser = currentUserService.requireCurrentUser();
        var collection = collectionRepository.findById(collectionId)
                .orElseThrow(() -> new ResourceNotFoundException(collectionId, "Collection"));
        currentUserService.requireCollectionAccess(currentUser, collection);
        var pageable = PagingRequest.pageable(
                page, size, sort, DOCUMENT_SORT_FIELDS, "createdAt,desc");
        var results = documentRepository.findAll(
                availableLibrarySourceSpec(collectionId, currentUser.getId(), q), pageable);
        return PagedResponse.from(results.map(DocumentResponse::from));
    }

    @Override
    @Transactional(readOnly = true)
    public PagedResponse<SourceLibraryItemResponse> getSourceLibrary(
            int page, int size, String sort, String q, ProcessingStatus processingStatus) {
        User currentUser = currentUserService.requireCurrentUser();
        var pageable = PagingRequest.pageable(
                page, size, sort, DOCUMENT_SORT_FIELDS, "createdAt,desc");
        var results = documentRepository.findAll(
                sourceLibrarySpec(currentUser.getId(), q, processingStatus), pageable);
        return PagedResponse.from(results.map(this::toSourceLibraryItem));
    }

    @Override
    @Transactional
    public DocumentResponse addSourceToCollection(UUID collectionId, UUID sourceId) {
        var currentUser = currentUserService.requireCurrentUser();
        var collection = collectionRepository.findById(collectionId)
                .orElseThrow(() -> new ResourceNotFoundException(collectionId, "Collection"));
        currentUserService.requireCollectionAccess(currentUser, collection);
        Document doc = findDocument(sourceId);
        if (doc.getDocType() != DocumentType.SOURCE || !doc.isActive()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Source not found or inactive");
        }
        currentUserService.requireUserIdOrAdmin(currentUser, doc.getUploadedBy().getId());
        return DocumentResponse.from(projectCollectionService.addSource(doc, collection, currentUser));
    }

    @Override
    @Transactional
    public void removeSourceFromCollection(UUID collectionId, UUID sourceId) {
        var currentUser = currentUserService.requireCurrentUser();
        var collection = collectionRepository.findById(collectionId)
                .orElseThrow(() -> new ResourceNotFoundException(collectionId, "Collection"));
        currentUserService.requireCollectionAccess(currentUser, collection);
        Document document = findDocument(sourceId);
        projectCollectionService.removeSource(document, collection);
    }

    @Override
    @Transactional
    public SourceLibraryItemResponse updateSource(UUID id, String title) {
        User currentUser = currentUserService.requireCurrentUser();
        Document source = requireOwnedActiveSource(currentUser, id);
        requireDocumentWriteAccess(currentUser, source);
        source.setTitle(title.trim());
        return toSourceLibraryItem(documentRepository.save(source));
    }

    @Override
    @Transactional
    public void deleteSource(UUID id) {
        User currentUser = currentUserService.requireCurrentUser();
        Document source = requireOwnedActiveSource(currentUser, id);
        requireDocumentWriteAccess(currentUser, source);
        projectCollectionService.removeSource(source);
        source.setActive(false);
        documentRepository.save(source);
    }

    @Override
    @Transactional
    public DocumentResponse updateDocumentMetadata(UUID id, String title, String originalFilename) {
        var currentUser = currentUserService.requireCurrentUser();
        Document doc = findDocument(id);
        requireDocumentWriteAccess(currentUser, doc);
        if (title != null) doc.setTitle(title);
        if (originalFilename != null) doc.setOriginalFilename(originalFilename);
        return DocumentResponse.from(documentRepository.save(doc));
    }

    @Override
    @Transactional(readOnly = true)
    public List<DocumentResponse> getSourcesByCollection(UUID collectionId) {
        var currentUser = currentUserService.requireCurrentUser();
        var collection = collectionRepository.findById(collectionId)
                .orElseThrow(() -> new ResourceNotFoundException(collectionId, "Collection"));
        currentUserService.requireCollectionAccess(currentUser, collection);
        Map<UUID, Document> documents = new LinkedHashMap<>();
        documentRepository.findByCollectionId(collectionId).stream()
                .filter(doc -> doc.isActive() && doc.getDocType() == DocumentType.SOURCE)
                .forEach(doc -> documents.put(doc.getId(), doc));
        collectionDocumentRepository.findByCollectionId(collectionId).stream()
                .map(CollectionDocument::getDocument)
                .filter(doc -> doc.isActive() && doc.getDocType() == DocumentType.SOURCE)
                .forEach(doc -> documents.put(doc.getId(), doc));
        return documents.values().stream().map(DocumentResponse::from).toList();
    }

    @Override
    public PagedResponse<DocumentResponse> getSourcesByProject(
            UUID projectId,
            int page,
            int size,
            String sort,
            String q,
            ProcessingStatus processingStatus,
            Boolean active) {
        requireProjectAccess(projectId);

        var pageable = PagingRequest.pageable(
                page, size, sort, DOCUMENT_SORT_FIELDS, "createdAt,desc");
        var direct = documentRepository.findAll(
                documentSpec(projectId, DocumentType.SOURCE, processingStatus, active, q));
        var shared = projectDocumentRepository.findByProjectId(projectId).stream()
                .map(ProjectDocument::getDocument)
                .filter(d -> d.getDocType() == DocumentType.SOURCE)
                .filter(d -> processingStatus == null || d.getProcessingStatus() == processingStatus)
                .filter(d -> d.isActive() == (active != null ? active : true))
                .filter(d -> matchesDocumentQuery(d, q))
                .toList();

        Map<UUID, Document> byId = new LinkedHashMap<>();
        direct.forEach(document -> byId.put(document.getId(), document));
        shared.forEach(document -> byId.put(document.getId(), document));
        List<Document> combined = new ArrayList<>(byId.values());
        Sort.Order order = pageable.getSort().iterator().next();
        combined.sort(documentComparator(order));

        int total = combined.size();
        int safePage = pageable.getPageNumber();
        int safeSize = pageable.getPageSize();
        int from = safePage * safeSize;
        int to = Math.min(from + safeSize, total);
        List<DocumentResponse> pageContent = from < total
                ? combined.subList(from, to).stream().map(DocumentResponse::from).toList()
                : List.of();

        return new PagedResponse<>(
                pageContent,
                safePage,
                safeSize,
                total,
                (int) Math.ceil((double) total / safeSize),
                to >= total);
    }

    @Override
    public DocumentResponse uploadDocument(UUID projectId, MultipartFile file, DocumentType docType) {
        return uploadDocument(projectId, null, file, docType);
    }

    @Override
    public DocumentResponse uploadDocument(UUID projectId, UUID collectionId, MultipartFile file, DocumentType docType) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "File is empty");
        }
        validateFile(file, docType);
        var currentUser = currentUserService.requireCurrentUser();

        Project project = null;
        if (projectId != null) {
            project = projectRepository.findById(projectId)
                    .orElseThrow(() -> new ResourceNotFoundException(projectId, "Project"));
            currentUserService.requireProjectWriteAccess(currentUser, project);
        }

        com.evidencepilot.model.Collection collection = null;
        if (collectionId != null) {
            collection = collectionRepository.findById(collectionId)
                    .orElseThrow(() -> new ResourceNotFoundException(collectionId, "Collection"));
            currentUserService.requireCollectionAccess(currentUser, collection);
        }

        String originalName = file.getOriginalFilename();

        // Step A: Save pending document (transactional)
        Document document = documentPersistenceService.savePendingDocument(
                project, collection, currentUser, docType, originalName,
                file.getContentType(), file.getSize());

        // Step B: Upload to MinIO (non-transactional — holds no DB connection)
        String objectKey = "sources/raw/" + document.getId().toString() + fileExtension(originalName);

        String fileHashSha256;
        try (var in = file.getInputStream()) {
            fileHashSha256 = documentObjectStorage.writeWithSha256(
                    objectKey, in, file.getSize(), file.getContentType());
        } catch (Exception e) {
            RuntimeException failure = new RuntimeException("Failed to upload file to MinIO", e);
            deleteObjectAfterFailure(objectKey, failure);
            try {
                documentPersistenceService.markFailed(document.getId(), "File upload to storage failed");
            } catch (RuntimeException statusFailure) {
                failure.addSuppressed(statusFailure);
            }
            throw failure;
        }

        // Step C: Mark document as uploaded (transactional, publishes event after commit)
        try {
            document = documentPersistenceService.markDocumentAsUploaded(
                    document.getId(), objectKey, fileHashSha256);
        } catch (RuntimeException e) {
            deleteAfterFailedMetadataUpdate(objectKey, document.getId(), e);
            throw e;
        }

        if (project != null || collection != null) {
            projectCollectionService.syncSource(document);
        }

        return DocumentResponse.from(document);
    }

    @Override
    @Transactional
    public Map<String, Object> shareToProject(UUID collectionId, UUID sourceId, UUID projectId) {
        var currentUser = currentUserService.requireCurrentUser();
        var collection = collectionRepository.findById(collectionId)
                .orElseThrow(() -> new ResourceNotFoundException(collectionId, "Collection"));
        currentUserService.requireCollectionAccess(currentUser, collection);

        Document doc = findDocument(sourceId);
        if (doc.getDocType() != DocumentType.SOURCE || !doc.isActive()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Source not found or inactive");
        }
        boolean inCollection = doc.getCollection() != null
                && collectionId.equals(doc.getCollection().getId());
        if (!inCollection && !collectionDocumentRepository
                .existsByCollectionIdAndDocumentId(collectionId, doc.getId())) {
            throw new ResourceNotFoundException(sourceId, "Source in collection");
        }
        ProcessingStatus status = doc.getProcessingStatus();
        if (status != ProcessingStatus.READY && status != ProcessingStatus.COMPLETED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Source is not ready to share (current status: " + status + "); only READY or COMPLETED sources can be shared");
        }

        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new ResourceNotFoundException(projectId, "Project"));
        currentUserService.requireProjectWriteAccess(currentUser, project);

        projectCollectionService.pinSource(project, doc, collection, currentUser);

        String score = "MEDIUM";
        String explanation = "Document shared to project \"" + project.getTitle() + "\"";
        List<String> matchedTerms = new ArrayList<>();
        if (doc.getTitle() != null && project.getTitle() != null) {
            String docTitle = doc.getTitle().toLowerCase(Locale.ROOT);
            String projTitle = project.getTitle().toLowerCase(Locale.ROOT);
            for (String word : projTitle.split("\\s+")) {
                if (word.length() > 3 && docTitle.contains(word)) {
                    matchedTerms.add(word);
                }
            }
            if (!matchedTerms.isEmpty()) {
                score = "HIGH";
                explanation = "Document shares " + matchedTerms.size() + " keyword(s) with project topic";
            } else if (doc.getAuthors() != null) {
                score = "MEDIUM";
                explanation = "Document metadata partially overlaps with project topic";
            } else {
                score = "LOW";
                explanation = "Document appears unrelated to project \"" + project.getTitle() + "\"";
            }
        }

        return Map.of(
                "document", DocumentResponse.from(doc),
                "suitability", Map.of("score", score, "explanation", explanation, "matchedTerms", matchedTerms),
                "warnings", "LOW".equals(score)
                        ? List.of("This document appears unrelated to \"" + project.getTitle()
                                + "\". It may not be useful as evidence.")
                        : List.of());
    }

    @Override
    @Transactional
    public void removeSharedDocument(UUID projectId, UUID sourceId) {
        var currentUser = currentUserService.requireCurrentUser();
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new ResourceNotFoundException(projectId, "Project"));
        currentUserService.requireProjectWriteAccess(currentUser, project);

        ProjectDocument pd = projectDocumentRepository.findByProjectIdAndDocumentId(projectId, sourceId)
                .orElseThrow(() -> new ResourceNotFoundException("Shared document not found"));
        if (pd.getProjectCollection() != null) {
            projectCollectionService.unshare(pd);
            return;
        }

        // Guard: only allow unshare if sections are clean
        List<Document> papers = documentRepository
                .findByProjectIdAndDocTypeAndActiveTrue(projectId, DocumentType.PAPER);
        for (Document paper : papers) {
            var sections = paperSectionRepository
                    .findByDocumentIdOrderBySectionOrderAsc(paper.getId());
            if (project.getTargetStandard() != null) {
                boolean hasContent = sections.stream()
                        .anyMatch(s -> s.getContentTex() != null && !s.getContentTex().isBlank());
                if (hasContent) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT,
                            "Sections contain content — cannot remove shared source");
                }
            } else {
                boolean hasAssigned = sections.stream()
                        .anyMatch(s -> s.getAssignedUser() != null);
                if (hasAssigned) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT,
                            "Sections have assigned students — cannot remove shared source");
                }
            }
        }

        projectCollectionService.unshare(pd);
    }

    @Override
    public Document getDocumentForDownload(UUID id, String token) {
        Document doc = findDocument(id);
        if (!doc.isActive()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Document not found");
        }
        if (token == null || !token.equals(doc.getDownloadToken())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Invalid download token");
        }
        return doc;
    }

    @Override
    public List<DocumentChunkResponse> getDocumentChunks(UUID documentId) {
        var currentUser = currentUserService.requireCurrentUser();
        Document doc = findDocument(documentId);
        requireDocumentAccess(currentUser, doc);
        return documentChunkRepository.findByDocumentIdOrderByChunkIndexAsc(documentId).stream()
                .map(DocumentChunkResponse::from)
                .toList();
    }

    @Override
    public DocumentTextResponse getDocumentText(UUID documentId) {
        var currentUser = currentUserService.requireCurrentUser();
        Document doc = findDocument(documentId);
        requireDocumentAccess(currentUser, doc);
        var text = documentTextRepository.findByDocumentId(documentId);
        if (text == null) {
            throw new ResourceNotFoundException("Document text not found for document " + documentId);
        }
        return DocumentTextResponse.from(text);
    }

    @Override
    @Transactional
    public DocumentTextResponse saveDraft(UUID documentId, String extractedText) {
        if (extractedText != null && extractedText.length() > MAX_EXTRACTED_TEXT_LENGTH) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Text exceeds the maximum allowed length");
        }
        var currentUser = currentUserService.requireCurrentUser();
        Document doc = findDocument(documentId);
        // DEBT-05: writing a document's text is a mutation — read access is not enough.
        requireDocumentWriteAccess(currentUser, doc);
        var text = documentTextRepository.findByDocumentId(documentId);
        if (text == null) {
            text = new DocumentText();
            text.setDocument(doc);
            text.setExtractionMethod("manual");
        }
        text.setExtractedText(extractedText);
        documentTextRepository.save(text);
        return DocumentTextResponse.from(text);
    }

    @Override
    public DocumentResponse reExtract(UUID documentId) {
        var currentUser = currentUserService.requireCurrentUser();
        Document doc = findDocument(documentId);
        requireDocumentWriteAccess(currentUser, doc);
        if (doc.getFileUrl() == null || "pending".equals(doc.getFileUrl())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "No file in storage for this document");
        }
        ProcessingStatus status = doc.getProcessingStatus();
        // DEBT-07: only re-process documents in a terminal state; refuse while a
        // processing round is already in flight to avoid queue spam.
        if (status != ProcessingStatus.READY && status != ProcessingStatus.FAILED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Document is currently " + status + " and cannot be re-extracted");
        }
        documentObjectStorage.deleteExtractionCheckpoint(
                documentId, doc.getFileHashSha256());
        mediaAssetService.deleteExtractedForDocument(doc);
        qdrantService.deleteVectors(documentId);
        return DocumentResponse.from(
                documentPersistenceService.markDocumentAsUploaded(
                        documentId, doc.getFileUrl(), doc.getFileHashSha256()));
    }

    @Override
    @Transactional
    public DocumentResponse attachFileToDocument(UUID documentId, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "File is empty");
        }
        var currentUser = currentUserService.requireCurrentUser();
        Document doc = findDocument(documentId);
        requireDocumentWriteAccess(currentUser, doc);
        validateFile(file, doc.getDocType());

        if (doc.getProcessingStatus() != ProcessingStatus.METADATA_FETCHED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Can only attach file to a metadata-only document (status: METADATA_FETCHED)");
        }

        String objectKey = "sources/raw/" + doc.getId().toString() + fileExtension(file.getOriginalFilename());
        String fileHashSha256;
        try (var in = file.getInputStream()) {
            fileHashSha256 = documentObjectStorage.writeWithSha256(
                    objectKey, in, file.getSize(), file.getContentType());
        } catch (Exception e) {
            RuntimeException failure = new RuntimeException("Failed to upload file to MinIO", e);
            deleteObjectAfterFailure(objectKey, failure);
            throw failure;
        }
        deleteObjectOnRollback(objectKey);

        doc.setContentType(file.getContentType());
        doc.setOriginalFilename(file.getOriginalFilename());
        doc.setFileSizeBytes(file.getSize());
        try {
            doc = documentPersistenceService.markDocumentAsUploaded(
                    doc.getId(), objectKey, fileHashSha256);
        } catch (RuntimeException e) {
            deleteAfterFailedMetadataUpdate(objectKey, doc.getId(), e);
            throw e;
        }

        return DocumentResponse.from(doc);
    }

    @Override
    @Transactional
    public void deleteDocument(UUID id) {
        var currentUser = currentUserService.requireCurrentUser();
        Document doc = findDocument(id);
        requireDocumentWriteAccess(currentUser, doc);
        projectCollectionService.removeSource(doc);
        mediaAssetService.deleteExtractedForDocument(doc);
        doc.setActive(false);
        doc.setDownloadToken(UUID.randomUUID().toString());
        documentRepository.save(doc);
        deleteDerivedDataAfterCommit(doc.getId(), doc.getFileHashSha256());
    }

    private void deleteAfterFailedMetadataUpdate(String objectKey, UUID documentId, RuntimeException failure) {
        deleteObjectAfterFailure(objectKey, failure);
        try {
            documentPersistenceService.markFailed(documentId, "File metadata update failed");
        } catch (RuntimeException statusFailure) {
            failure.addSuppressed(statusFailure);
        }
    }

    private void deleteObjectAfterFailure(String objectKey, RuntimeException failure) {
        try {
            documentObjectStorage.delete(objectKey);
        } catch (RuntimeException cleanupFailure) {
            failure.addSuppressed(cleanupFailure);
        }
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
                    log.warn("Failed to delete rolled-back object {}", objectKey, e);
                }
            }
        });
    }

    private void deleteDerivedDataAfterCommit(UUID documentId, String fileHashSha256) {
        Runnable cleanup = () -> {
            try {
                documentObjectStorage.deleteExtractionCheckpoint(documentId, fileHashSha256);
            } catch (RuntimeException e) {
                log.warn("Failed to delete extraction checkpoint for document {}", documentId, e);
            }
            try {
                qdrantService.deleteVectors(documentId);
            } catch (RuntimeException e) {
                log.warn("Failed to delete Qdrant vectors for document {}", documentId, e);
            }
        };
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    cleanup.run();
                }
            });
        } else {
            cleanup.run();
        }
    }

    private Document findDocument(UUID id) {
        return documentRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException(id, "Document"));
    }

    private void requireDocumentAccess(User currentUser, Document doc) {
        if (doc.getProject() != null) {
            currentUserService.requireProjectAccess(currentUser, doc.getProject());
            return;
        }
        List<ProjectDocument> projectLinks = projectDocumentRepository.findByDocumentId(doc.getId());
        if (!projectLinks.isEmpty()) {
            for (ProjectDocument pd : projectLinks) {
                try {
                    currentUserService.requireProjectAccess(currentUser, pd.getProject());
                    return;
                } catch (ResponseStatusException e) {
                    continue;
                }
            }
        }
        if (doc.getCollection() != null) {
            currentUserService.requireCollectionAccess(currentUser, doc.getCollection());
            return;
        }
        currentUserService.requireUserIdOrAdmin(currentUser, doc.getUploadedBy().getId());
    }

    private void requireDocumentWriteAccess(User currentUser, Document doc) {
        if (doc.getProject() != null) {
            currentUserService.requireProjectWriteAccess(currentUser, doc.getProject());
        } else if (doc.getCollection() != null) {
            currentUserService.requireCollectionAccess(currentUser, doc.getCollection());
        } else {
            currentUserService.requireUserIdOrAdmin(currentUser, doc.getUploadedBy().getId());
        }
        for (ProjectDocument link : projectDocumentRepository.findByDocumentId(doc.getId())) {
            ProjectStatus status = link.getProject().getStatus();
            if (status.isReadOnly()) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Project is read-only.");
            }
            if (status == ProjectStatus.SUBMITTED_FOR_REVIEW) {
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT, "Project is locked and cannot be modified.");
            }
        }
    }

    private void requireProjectAccess(UUID projectId) {
        var currentUser = currentUserService.requireCurrentUser();
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new ResourceNotFoundException(projectId, "Project"));
        currentUserService.requireProjectAccess(currentUser, project);
    }

    private SourceLibraryItemResponse toSourceLibraryItem(Document source) {
        Map<UUID, String> collections = new LinkedHashMap<>();
        if (source.getCollection() != null && source.getCollection().isActive()) {
            collections.put(source.getCollection().getId(), source.getCollection().getTitle());
        }
        collectionDocumentRepository.findByDocumentId(source.getId()).stream()
                .map(CollectionDocument::getCollection)
                .filter(Collection::isActive)
                .forEach(collection -> collections.put(collection.getId(), collection.getTitle()));

        Map<UUID, String> projects = new LinkedHashMap<>();
        if (source.getProject() != null && source.getProject().isActive()) {
            projects.put(source.getProject().getId(), source.getProject().getTitle());
        }
        projectDocumentRepository.findByDocumentId(source.getId()).stream()
                .map(ProjectDocument::getProject)
                .filter(Project::isActive)
                .forEach(project -> projects.put(project.getId(), project.getTitle()));

        return new SourceLibraryItemResponse(
                source.getId(),
                source.getTitle(),
                source.getOriginalFilename(),
                source.getContentType(),
                source.getFileSizeBytes(),
                source.getProcessingStatus(),
                source.getProcessingError(),
                source.getCreatedAt(),
                toUsages(collections),
                toUsages(projects));
    }

    private static List<SourceLibraryItemResponse.Usage> toUsages(Map<UUID, String> usages) {
        return usages.entrySet().stream()
                .map(entry -> new SourceLibraryItemResponse.Usage(entry.getKey(), entry.getValue()))
                .toList();
    }

    private Specification<Document> collectionSourceSpec(UUID collectionId, String q) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            Subquery<UUID> memberships = query.subquery(UUID.class);
            var membership = memberships.from(CollectionDocument.class);
            memberships.select(membership.get("document").get("id"))
                    .where(cb.equal(membership.get("collection").get("id"), collectionId));
            predicates.add(cb.or(
                    cb.equal(root.get("collection").get("id"), collectionId),
                    root.get("id").in(memberships)));
            predicates.add(cb.equal(root.get("docType"), DocumentType.SOURCE));
            predicates.add(cb.equal(root.get("active"), true));

            if (q != null && !q.isBlank()) {
                String like = "%" + q.trim().toLowerCase(Locale.ROOT) + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("title")), like),
                        cb.like(cb.lower(root.get("originalFilename")), like),
                        cb.like(cb.lower(root.get("fileUrl")), like)));
            }

            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }

    private Document requireOwnedActiveSource(User currentUser, UUID id) {
        Document source = findDocument(id);
        if (source.getDocType() != DocumentType.SOURCE || !source.isActive()) {
            throw new ResourceNotFoundException(id, "Source");
        }
        currentUserService.requireUserIdOrAdmin(currentUser, source.getUploadedBy().getId());
        return source;
    }

    private Specification<Document> availableLibrarySourceSpec(
            UUID collectionId, UUID uploadedBy, String q) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            Subquery<UUID> memberships = query.subquery(UUID.class);
            var membership = memberships.from(CollectionDocument.class);
            memberships.select(membership.get("document").get("id"))
                    .where(cb.equal(membership.get("collection").get("id"), collectionId));

            predicates.add(cb.equal(root.get("uploadedBy").get("id"), uploadedBy));
            predicates.add(cb.equal(root.get("docType"), DocumentType.SOURCE));
            predicates.add(cb.equal(root.get("active"), true));
            predicates.add(cb.or(
                    cb.isNull(root.get("collection")),
                    cb.notEqual(root.get("collection").get("id"), collectionId)));
            predicates.add(cb.not(root.get("id").in(memberships)));

            if (q != null && !q.isBlank()) {
                String like = "%" + q.trim().toLowerCase(Locale.ROOT) + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("title")), like),
                        cb.like(cb.lower(root.get("originalFilename")), like),
                        cb.like(cb.lower(root.get("fileUrl")), like)));
            }

            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }

    private Specification<Document> sourceLibrarySpec(
            UUID uploadedBy, String q, ProcessingStatus processingStatus) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.get("uploadedBy").get("id"), uploadedBy));
            predicates.add(cb.equal(root.get("docType"), DocumentType.SOURCE));
            predicates.add(cb.equal(root.get("active"), true));

            if (processingStatus != null) {
                predicates.add(cb.equal(root.get("processingStatus"), processingStatus));
            }
            if (q != null && !q.isBlank()) {
                String like = "%" + q.trim().toLowerCase(Locale.ROOT) + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("title")), like),
                        cb.like(cb.lower(root.get("originalFilename")), like),
                        cb.like(cb.lower(root.get("contentType")), like)));
            }

            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }

    private Specification<Document> documentSpec(
            UUID projectId,
            DocumentType docType,
            ProcessingStatus processingStatus,
            Boolean active,
            String q) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.get("project").get("id"), projectId));
            predicates.add(cb.equal(root.get("active"), active != null ? active : true));

            if (docType != null) {
                predicates.add(cb.equal(root.get("docType"), docType));
            }

            if (processingStatus != null) {
                predicates.add(cb.equal(root.get("processingStatus"), processingStatus));
            }

            if (q != null && !q.isBlank()) {
                String like = "%" + q.trim().toLowerCase(Locale.ROOT) + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("title")), like),
                        cb.like(cb.lower(root.get("originalFilename")), like),
                        cb.like(cb.lower(root.get("contentType")), like),
                        cb.like(cb.lower(root.get("fileUrl")), like)));
            }

            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }

    private static boolean matchesDocumentQuery(Document document, String q) {
        if (q == null || q.isBlank()) {
            return true;
        }
        String query = q.trim().toLowerCase(Locale.ROOT);
        return containsIgnoreCase(document.getTitle(), query)
                || containsIgnoreCase(document.getOriginalFilename(), query)
                || containsIgnoreCase(document.getContentType(), query)
                || containsIgnoreCase(document.getFileUrl(), query);
    }

    private static boolean containsIgnoreCase(String value, String query) {
        return value != null && value.toLowerCase(Locale.ROOT).contains(query);
    }

    private static Comparator<Document> documentComparator(Sort.Order order) {
        Comparator<Document> comparator = switch (order.getProperty()) {
            case "title" -> Comparator.comparing(
                    Document::getTitle,
                    Comparator.nullsLast(String.CASE_INSENSITIVE_ORDER));
            case "originalFilename" -> Comparator.comparing(
                    Document::getOriginalFilename,
                    Comparator.nullsLast(String.CASE_INSENSITIVE_ORDER));
            case "docType" -> Comparator.comparing(
                    Document::getDocType,
                    Comparator.nullsLast(Comparator.naturalOrder()));
            case "processingStatus" -> Comparator.comparing(
                    Document::getProcessingStatus,
                    Comparator.nullsLast(Comparator.naturalOrder()));
            case "fileSizeBytes" -> Comparator.comparing(
                    Document::getFileSizeBytes,
                    Comparator.nullsLast(Comparator.naturalOrder()));
            default -> Comparator.comparing(
                    Document::getCreatedAt,
                    Comparator.nullsLast(Comparator.naturalOrder()));
        };
        return order.isDescending() ? comparator.reversed() : comparator;
    }

    private static String fileExtension(String filename) {
        if (filename == null || filename.isBlank()) {
            return ".bin";
        }
        int dot = filename.lastIndexOf('.');
        if (dot < 0 || dot == filename.length() - 1) {
            return ".bin";
        }
        String extension = filename.substring(dot).toLowerCase(Locale.ROOT);
        if (!extension.matches("\\.[a-z0-9]{1,12}")) {
            return ".bin";
        }
        return extension;
    }

    static void validateFile(MultipartFile file, DocumentType docType) {
        String extension = fileExtension(file.getOriginalFilename());
        String contentType = file.getContentType() == null
                ? ""
                : file.getContentType().toLowerCase(Locale.ROOT);
        boolean genericType = contentType.isBlank() || contentType.equals("application/octet-stream");
        boolean supported = switch (extension) {
            case ".pdf" -> genericType || contentType.equals("application/pdf");
            case ".docx" -> genericType || contentType.equals(
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
            case ".md", ".markdown" -> genericType
                    || contentType.startsWith("text/markdown")
                    || contentType.startsWith("text/plain");
            case ".tex" -> docType == DocumentType.PAPER
                    && (genericType
                    || contentType.equals("application/x-tex")
                    || contentType.equals("application/x-latex")
                    || contentType.equals("text/x-tex")
                    || contentType.startsWith("text/plain"));
            default -> false;
        };
        if (!supported) {
            throw new ResponseStatusException(
                    HttpStatus.UNSUPPORTED_MEDIA_TYPE,
                    docType == DocumentType.PAPER
                            ? "Only PDF, DOCX, Markdown, and LaTeX files are supported for papers"
                            : "Only PDF, DOCX, and Markdown files are supported");
        }
    }

    @Override
    @Transactional(readOnly = true)
    public Map<String, Object> getDiagnostics(UUID id) {
        Document doc = documentRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException(id, "Document"));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", doc.getId());
        result.put("originalFilename", doc.getOriginalFilename());
        result.put("title", doc.getTitle());
        result.put("doi", doc.getDoi());
        result.put("docType", doc.getDocType() != null ? doc.getDocType().name() : null);
        result.put("processingStatus", doc.getProcessingStatus() != null ? doc.getProcessingStatus().name() : null);
        result.put("chunkCount", doc.getChunkCount());
        result.put("createdAt", doc.getCreatedAt() != null ? doc.getCreatedAt().toString() : null);
        result.put("processedAt", doc.getProcessedAt() != null ? doc.getProcessedAt().toString() : null);
        result.put("projectName", doc.getProject() != null ? doc.getProject().getTitle() : null);
        result.put("processingError", doc.getProcessingError());

        if (doc.getDoi() != null && !doc.getDoi().isBlank()) {
            try {
                OpenAlexWorkResponse work = openAlexClient.fetchWork(doc.getDoi());
                result.put("openAlexRaw", objectMapper.convertValue(work, Map.class));
            } catch (Exception e) {
                result.put("openAlexError", e.getMessage());
            }
        }

        String checkpointKey = DocumentObjectStorage.extractionCheckpointKey(
                doc.getId(), doc.getFileHashSha256());
        if (documentObjectStorage.exists(checkpointKey)) {
            try {
                result.put("extractionAvailable", true);
                result.put("extractionJson", objectMapper.readValue(
                        documentObjectStorage.readText(checkpointKey), Map.class));
            } catch (Exception e) {
                result.put("extractionAvailable", false);
                result.put("extractionError", e.getMessage());
            }
        } else {
            result.put("extractionAvailable", false);
        }
        return result;
    }
}
