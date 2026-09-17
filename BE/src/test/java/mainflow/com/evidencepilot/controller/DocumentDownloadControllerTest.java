package com.evidencepilot.controller;

import com.evidencepilot.dto.response.DocumentResponse;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.service.DocumentObjectStorage;
import com.evidencepilot.service.impl.DocumentServiceImpl;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.io.ByteArrayInputStream;
import java.util.UUID;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

class DocumentDownloadControllerTest {

    @Test
    void downloadSupportsAuthenticatedUsersAndWorkerTokens() throws Exception {
        DocumentServiceImpl service = mock(DocumentServiceImpl.class);
        DocumentObjectStorage storage = mock(DocumentObjectStorage.class);
        MockMvc mockMvc = standaloneSetup(new DocumentController(service, storage)).build();
        UUID documentId = UUID.randomUUID();
        String objectKey = "sources/raw/" + documentId + ".pdf";
        byte[] pdf = {1, 2, 3, 4};
        Document document = new Document();
        document.setId(documentId);
        document.setDocType(DocumentType.SOURCE);
        document.setFileUrl(objectKey);
        document.setOriginalFilename("source.pdf");
        when(service.getDocumentById(documentId)).thenReturn(DocumentResponse.from(document));
        when(service.getDocumentForDownload(documentId, "worker-token")).thenReturn(document);
        when(storage.getStream(objectKey)).thenAnswer(ignored -> new ByteArrayInputStream(pdf));

        mockMvc.perform(get("/api/documents/{id}/download", documentId))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"source.pdf\""))
                .andExpect(content().contentType(MediaType.APPLICATION_PDF))
                .andExpect(content().bytes(pdf));

        mockMvc.perform(get("/api/documents/{id}/download", documentId)
                        .param("token", "worker-token"))
                .andExpect(status().isOk())
                .andExpect(content().bytes(pdf));

        verify(service).getDocumentById(documentId);
        verify(service).getDocumentForDownload(documentId, "worker-token");
    }
}
