package com.evidencepilot.service.event;

import com.evidencepilot.service.SourceExtractionService;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class DocumentUploadedEventListenerTest {

    @Test
    void handleDocumentUploaded_triggersExtraction() {
        SourceExtractionService extraction = mock(SourceExtractionService.class);
        UUID id = UUID.randomUUID();

        new DocumentUploadedEventListener(extraction).handleDocumentUploaded(new DocumentUploadedEvent(id));

        verify(extraction).triggerExtraction(id);
    }
}
