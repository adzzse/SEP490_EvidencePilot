package com.evidencepilot.service.listener;

import com.evidencepilot.dto.ExtractionRequest;
import com.evidencepilot.service.DocumentExtractionWorker;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class DocumentExtractionListenerTest {

    @Test
    void handleDelegatesDocumentIdToJavaWorker() {
        DocumentExtractionWorker worker = mock(DocumentExtractionWorker.class);
        UUID documentId = UUID.randomUUID();

        new DocumentExtractionListener(worker)
                .handle(new ExtractionRequest(documentId));

        verify(worker).process(documentId);
    }
}
