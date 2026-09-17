package com.evidencepilot.service;

import com.evidencepilot.model.Document;
import com.evidencepilot.model.DocumentChunk;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.AccountStatus;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.ProcessingStatus;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.DocumentChunkRepository;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.DocumentTextRepository;
import com.evidencepilot.repository.UserRepository;
import com.evidencepilot.service.event.DocumentUploadedEvent;
import com.evidencepilot.service.impl.DocumentPersistenceService;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class DocumentPersistenceServiceTest {

    private final DocumentRepository documents = mock(DocumentRepository.class);
    private final DocumentTextRepository texts = mock(DocumentTextRepository.class);
    private final DocumentChunkRepository chunks = mock(DocumentChunkRepository.class);
    private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
    private final AuditService audit = mock(AuditService.class);
    private final SystemNotificationService notifications = mock(SystemNotificationService.class);
    private final UserRepository users = mock(UserRepository.class);
    private final DocumentPersistenceService service = new DocumentPersistenceService(
            documents, texts, chunks, events, audit, notifications, users);

    @Test
    void savePendingDocument_populatesUploadMetadata() {
        Project project = new Project();
        User user = new User();
        when(documents.save(any(Document.class))).thenAnswer(invocation -> invocation.getArgument(0));

        Document saved = service.savePendingDocument(
                project, null, user, DocumentType.SOURCE, "source.pdf", "application/pdf", 12L);

        assertThat(saved.getProject()).isSameAs(project);
        assertThat(saved.getUploadedBy()).isSameAs(user);
        assertThat(saved.getDocType()).isEqualTo(DocumentType.SOURCE);
        assertThat(saved.getFileUrl()).isEqualTo("pending");
        assertThat(saved.getProcessingStatus()).isEqualTo(ProcessingStatus.PENDING_UPLOAD);
        assertThat(saved.isActive()).isTrue();
        assertThat(saved.getCreatedAt()).isNotNull();
    }

    @Test
    void markDocumentAsUploaded_updatesStatusAndPublishesEvent() {
        UUID id = UUID.randomUUID();
        Document document = new Document();
        document.setId(id);
        document.setOriginalFilename("paper.pdf");
        document.setDocType(DocumentType.SOURCE);
        User uploader = new User();
        uploader.setId(UUID.randomUUID());
        document.setUploadedBy(uploader);
        when(documents.findById(id)).thenReturn(Optional.of(document));
        when(documents.save(document)).thenReturn(document);

        Document saved = service.markDocumentAsUploaded(id, "sources/raw/file.pdf", "abc123");

        assertThat(saved.getProcessingStatus()).isEqualTo(ProcessingStatus.UPLOADED);
        assertThat(saved.getFileUrl()).isEqualTo("sources/raw/file.pdf");
        assertThat(saved.getFileHashSha256()).isEqualTo("abc123");
        verify(events).publishEvent(new DocumentUploadedEvent(id));
        // ponytail: the upload also writes a DOCUMENT_UPLOADED audit row so the
        // instructor's "My Activity" feed can render a Source Library entry.
        verify(audit).record(eq("DOCUMENT_UPLOADED"), eq("DOCUMENT"), eq(id), eq(uploader),
                isNull(), any());
    }

    @Test
    void markDocumentAsUploaded_rejectsMissingDocument() {
        UUID id = UUID.randomUUID();
        assertThatThrownBy(() -> service.markDocumentAsUploaded(id, "key", "hash"))
                .hasMessageContaining(id.toString());
        verifyNoInteractions(events, audit);
    }

    @Test
    void markQueuedForRetryOnlyTransitionsProcessingDocument() {
        UUID id = UUID.randomUUID();
        when(documents.queueForExtraction(
                id, List.of(ProcessingStatus.PROCESSING), ProcessingStatus.QUEUED))
                .thenReturn(1);

        assertThat(service.markQueuedForRetry(id)).isTrue();

        verify(documents).queueForExtraction(
                id, List.of(ProcessingStatus.PROCESSING), ProcessingStatus.QUEUED);
    }

    @Test
    void markReadyNotifiesOwnerAndAdmins() {
        UUID id = UUID.randomUUID();
        User owner = new User();
        owner.setId(UUID.randomUUID());
        User admin = new User();
        admin.setId(UUID.randomUUID());
        Document document = new Document();
        document.setId(id);
        document.setOriginalFilename("paper.pdf");
        document.setUploadedBy(owner);
        when(documents.findById(id)).thenReturn(Optional.of(document));
        when(users.findByAccountStatusAndRole(AccountStatus.ACTIVE, UserRole.ADMIN))
                .thenReturn(List.of(admin));

        service.markReady(id, 3);

        assertThat(document.getProcessingStatus()).isEqualTo(ProcessingStatus.READY);
        verify(notifications).createNotification(eq(owner), eq(owner), eq("DOCUMENT_READY"), eq(id), anyString());
        verify(notifications).createNotification(eq(admin), eq(owner), eq("DOCUMENT_READY"), eq(id), anyString());
    }

    @Test
    void markFailedNotifiesOwnerAndAdmins() {
        UUID id = UUID.randomUUID();
        User owner = new User();
        owner.setId(UUID.randomUUID());
        Document document = new Document();
        document.setId(id);
        document.setOriginalFilename("paper.pdf");
        document.setUploadedBy(owner);
        when(documents.findById(id)).thenReturn(Optional.of(document));
        when(users.findByAccountStatusAndRole(AccountStatus.ACTIVE, UserRole.ADMIN))
                .thenReturn(List.of());

        service.markFailed(id, "boom");

        assertThat(document.getProcessingStatus()).isEqualTo(ProcessingStatus.FAILED);
        verify(notifications).createNotification(eq(owner), eq(owner), eq("DOCUMENT_FAILED"), eq(id), anyString());
    }

    @Test
    void terminalNotificationFailureDoesNotEscape() {
        UUID id = UUID.randomUUID();
        User owner = new User();
        owner.setId(UUID.randomUUID());
        Document document = new Document();
        document.setId(id);
        document.setUploadedBy(owner);
        when(documents.findById(id)).thenReturn(Optional.of(document));
        when(users.findByAccountStatusAndRole(AccountStatus.ACTIVE, UserRole.ADMIN))
                .thenThrow(new RuntimeException("db down"));

        service.markReady(id, 1);

        assertThat(document.getProcessingStatus()).isEqualTo(ProcessingStatus.READY);
    }

    @Test
    void saveExtractionReusesExistingChunkIndex() {
        UUID id = UUID.randomUUID();
        Document document = new Document();
        document.setId(id);
        DocumentChunk existing = new DocumentChunk();
        existing.setId(UUID.randomUUID());
        existing.setDocument(document);
        existing.setChunkIndex(0);
        existing.setText("old");
        existing.setActive(true);
        when(documents.findById(id)).thenReturn(Optional.of(document));
        when(chunks.findByDocumentIdOrderByChunkIndexAsc(id)).thenReturn(List.of(existing));
        when(chunks.saveAll(any())).thenAnswer(invocation -> {
            List<DocumentChunk> saved = invocation.getArgument(0);
            saved.stream().filter(chunk -> chunk.getId() == null)
                    .forEach(chunk -> chunk.setId(UUID.randomUUID()));
            return saved;
        });

        List<DocumentChunk> saved = service.saveExtraction(id, "mineru", "markdown", List.of("new", "second"));

        assertThat(saved).hasSize(2);
        assertThat(saved.getFirst()).isSameAs(existing);
        assertThat(saved.getFirst().getText()).isEqualTo("new");
    }
}
