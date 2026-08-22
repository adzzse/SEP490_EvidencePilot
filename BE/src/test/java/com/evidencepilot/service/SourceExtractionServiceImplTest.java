package com.evidencepilot.service;

import com.evidencepilot.dto.ExtractionRequest;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.enums.ProcessingStatus;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.service.impl.SourceExtractionServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.amqp.AmqpException;
import org.springframework.amqp.rabbit.core.RabbitTemplate;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class SourceExtractionServiceImplTest {

    private final DocumentRepository documents = mock(DocumentRepository.class);
    private final RabbitTemplate rabbit = mock(RabbitTemplate.class);
    private final SourceExtractionServiceImpl service = new SourceExtractionServiceImpl(documents, rabbit);

    @BeforeEach
    void allowQueueTransition() {
        when(documents.queueForExtraction(
                any(UUID.class),
                eq(List.of(ProcessingStatus.UPLOADED, ProcessingStatus.QUEUED)),
                eq(ProcessingStatus.QUEUED)))
                .thenReturn(1);
    }

    @Test
    void triggerExtractionMarksQueuedAndPublishesRequest() {
        UUID id = UUID.randomUUID();
        Document document = document(id);
        when(documents.findById(id)).thenReturn(Optional.of(document));

        service.triggerExtraction(id);

        verify(documents).queueForExtraction(
                id,
                List.of(ProcessingStatus.UPLOADED, ProcessingStatus.QUEUED),
                ProcessingStatus.QUEUED);
        var captor = ArgumentCaptor.forClass(ExtractionRequest.class);
        verify(rabbit).convertAndSend(eq("extraction.queue"), captor.capture());
        assertThat(captor.getValue().documentId()).isEqualTo(id);
    }

    @Test
    void triggerExtractionKeepsQueuedWhenPublishFails() {
        UUID id = UUID.randomUUID();
        Document document = document(id);
        when(documents.findById(id)).thenReturn(Optional.of(document));
        org.mockito.Mockito.doThrow(new AmqpException("offline"))
                .when(rabbit).convertAndSend(eq("extraction.queue"), any(ExtractionRequest.class));

        service.triggerExtraction(id);

        verify(documents).queueForExtraction(
                id,
                List.of(ProcessingStatus.UPLOADED, ProcessingStatus.QUEUED),
                ProcessingStatus.QUEUED);
    }

    @Test
    void reenqueuePendingExtractionsPublishesUploadedAndQueuedDocuments() {
        Document uploaded = document(UUID.randomUUID());
        Document queued = document(UUID.randomUUID());
        when(documents.findIdsByProcessingStatusInAndActiveTrue(
                List.of(ProcessingStatus.UPLOADED, ProcessingStatus.QUEUED)))
                .thenReturn(List.of(uploaded.getId(), queued.getId()));

        service.reenqueuePendingExtractions();

        verify(rabbit).convertAndSend(
                eq("extraction.queue"), eq(new ExtractionRequest(uploaded.getId())));
        verify(rabbit).convertAndSend(
                eq("extraction.queue"), eq(new ExtractionRequest(queued.getId())));
    }

    @Test
    void reenqueueDoesNotPublishAfterDocumentLeavesQueue() {
        UUID id = UUID.randomUUID();
        when(documents.findIdsByProcessingStatusInAndActiveTrue(
                List.of(ProcessingStatus.UPLOADED, ProcessingStatus.QUEUED)))
                .thenReturn(List.of(id));
        when(documents.queueForExtraction(
                id,
                List.of(ProcessingStatus.UPLOADED, ProcessingStatus.QUEUED),
                ProcessingStatus.QUEUED))
                .thenReturn(0);

        service.reenqueuePendingExtractions();

        verifyNoInteractions(rabbit);
    }

    @Test
    void triggerExtractionRejectsMissingDocument() {
        UUID id = UUID.randomUUID();
        assertThatThrownBy(() -> service.triggerExtraction(id)).hasMessageContaining(id.toString());
        verifyNoInteractions(rabbit);
    }

    private static Document document(UUID id) {
        Document document = new Document();
        document.setId(id);
        return document;
    }
}
