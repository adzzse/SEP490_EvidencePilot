package com.evidencepilot.service;

import com.evidencepilot.model.Document;
import com.evidencepilot.model.DocumentChunk;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.ProcessingStatus;
import com.evidencepilot.repository.DocumentChunkRepository;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.DocumentTextRepository;
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
    private final DocumentPersistenceService service = new DocumentPersistenceService(documents, texts, chunks, events);

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
        when(documents.findById(id)).thenReturn(Optional.of(document));
        when(documents.save(document)).thenReturn(document);

        Document saved = service.markDocumentAsUploaded(id, "sources/raw/file.pdf", "abc123");

        assertThat(saved.getProcessingStatus()).isEqualTo(ProcessingStatus.UPLOADED);
        assertThat(saved.getFileUrl()).isEqualTo("sources/raw/file.pdf");
        assertThat(saved.getFileHashSha256()).isEqualTo("abc123");
        verify(events).publishEvent(new DocumentUploadedEvent(id));
    }

    @Test
    void markDocumentAsUploaded_rejectsMissingDocument() {
        UUID id = UUID.randomUUID();
        assertThatThrownBy(() -> service.markDocumentAsUploaded(id, "key", "hash"))
                .hasMessageContaining(id.toString());
        verifyNoInteractions(events);
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
