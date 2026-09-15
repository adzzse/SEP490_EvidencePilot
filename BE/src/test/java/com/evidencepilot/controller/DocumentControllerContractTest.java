package com.evidencepilot.controller;

import com.evidencepilot.service.DocumentObjectStorage;
import com.evidencepilot.service.impl.DocumentServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

class DocumentControllerContractTest {

    private final DocumentServiceImpl service = mock(DocumentServiceImpl.class);
    private final DocumentObjectStorage storage = mock(DocumentObjectStorage.class);
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = standaloneSetup(new DocumentController(service, storage)).build();
    }

    @Test
    void getDocumentById_delegatesId() throws Exception {
        UUID id = UUID.randomUUID();
        mockMvc.perform(get("/api/documents/{id}", id)).andExpect(status().isOk());
        verify(service).getDocumentById(id);
    }

    @Test
    void getDocumentChunks_delegatesId() throws Exception {
        UUID id = UUID.randomUUID();
        mockMvc.perform(get("/api/documents/{id}/chunks", id)).andExpect(status().isOk());
        verify(service).getDocumentChunks(id);
    }

    @Test
    void getDocumentText_delegatesId() throws Exception {
        UUID id = UUID.randomUUID();
        mockMvc.perform(get("/api/documents/{id}/text", id)).andExpect(status().isOk());
        verify(service).getDocumentText(id);
    }

    @Test
    void deleteDocument_returns204() throws Exception {
        UUID id = UUID.randomUUID();
        mockMvc.perform(delete("/api/documents/{id}", id)).andExpect(status().isNoContent());
        verify(service).deleteDocument(id);
    }
}
