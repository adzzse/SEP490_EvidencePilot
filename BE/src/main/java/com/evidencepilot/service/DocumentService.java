package com.evidencepilot.service;

import com.evidencepilot.dto.response.DocumentChunkResponse;
import com.evidencepilot.dto.response.DocumentResponse;
import com.evidencepilot.dto.response.DocumentTextResponse;
import com.evidencepilot.dto.response.PagedResponse;
import com.evidencepilot.dto.response.SourceLibraryItemResponse;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.ProcessingStatus;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.web.multipart.MultipartFile;

public interface DocumentService {
    DocumentResponse getDocumentById(UUID id);
    DocumentResponse getSourceById(UUID id);
    List<DocumentResponse> getDocumentsByProject(UUID projectId);
    List<DocumentResponse> getAllPapersForCurrentUser();
    PagedResponse<DocumentResponse> getDocumentsByProject(
            UUID projectId,
            int page,
            int size,
            String sort,
            String q,
            DocumentType docType,
            ProcessingStatus processingStatus,
            Boolean active);
    PagedResponse<DocumentResponse> getSourcesByProject(
            UUID projectId,
            int page,
            int size,
            String sort,
            String q,
            ProcessingStatus processingStatus,
            Boolean active);
    List<DocumentResponse> getSourcesByCollection(UUID collectionId);
    PagedResponse<DocumentResponse> getSourcesByCollection(UUID collectionId, int page, int size, String sort, String q);
    PagedResponse<DocumentResponse> getAvailableLibrarySources(
            UUID collectionId, int page, int size, String sort, String q);
    PagedResponse<SourceLibraryItemResponse> getSourceLibrary(
            int page, int size, String sort, String q, ProcessingStatus processingStatus);
    DocumentResponse addSourceToCollection(UUID collectionId, UUID sourceId);
    List<DocumentResponse> addSourcesToCollectionBatch(UUID collectionId, List<UUID> sourceIds);
    void removeSourceFromCollection(UUID collectionId, UUID sourceId);
    SourceLibraryItemResponse updateSource(UUID id, String title);
    void deleteSource(UUID id);
    DocumentResponse updateDocumentMetadata(UUID id, String title, String originalFilename);
    DocumentResponse uploadDocument(UUID projectId, MultipartFile file, DocumentType docType);

    DocumentResponse uploadDocument(UUID projectId, UUID collectionId, MultipartFile file, DocumentType docType);

    com.evidencepilot.dto.response.BatchUploadResponse uploadDocumentsBatch(
            UUID projectId, UUID collectionId, MultipartFile[] files, DocumentType docType);

    DocumentResponse attachFileToDocument(UUID documentId, MultipartFile file);
    Map<String, Object> shareToProject(UUID collectionId, UUID sourceId, UUID projectId);
    void removeSharedDocument(UUID projectId, UUID sourceId);
    List<DocumentChunkResponse> getDocumentChunks(UUID documentId);
    DocumentTextResponse getDocumentText(UUID documentId);
    DocumentTextResponse saveDraft(UUID documentId, String extractedText);
    DocumentResponse reExtract(UUID documentId);
    void deleteDocument(UUID id);
    Document getDocumentForDownload(UUID id, String token);
    Map<String, Object> getDiagnostics(UUID id);
}
