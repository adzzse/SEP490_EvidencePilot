package com.evidencepilot.controller;

import com.evidencepilot.dto.request.CollectionRequest;
import com.evidencepilot.service.impl.CollectionServiceImpl;
import com.evidencepilot.service.impl.DocumentServiceImpl;
import com.evidencepilot.service.impl.OpenAlexIngestionServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

class CollectionControllerTest {

    private final CollectionServiceImpl collectionService = mock(CollectionServiceImpl.class);
    private final DocumentServiceImpl documentService = mock(DocumentServiceImpl.class);
    private final OpenAlexIngestionServiceImpl openAlexIngestionService = mock(OpenAlexIngestionServiceImpl.class);
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = standaloneSetup(new CollectionController(collectionService, documentService, openAlexIngestionService))
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void createCollection_returns201() throws Exception {
        mockMvc.perform(post("/api/collections")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Evidence library\"}"))
                .andExpect(status().isCreated());
        verify(collectionService).createCollection(any(CollectionRequest.class));
    }

    @Test
    void getCollectionById_delegatesId() throws Exception {
        UUID id = UUID.randomUUID();
        mockMvc.perform(get("/api/collections/{id}", id)).andExpect(status().isOk());
        verify(collectionService).getCollectionById(id);
    }

    @Test
    void getMyCollections_delegates() throws Exception {
        mockMvc.perform(get("/api/collections")
                        .param("page", "1")
                        .param("size", "5"))
                .andExpect(status().isOk());
        verify(collectionService).getMyCollections(1, 5, null, null, null);
    }

    @Test
    void updateCollection_delegates() throws Exception {
        mockMvc.perform(put("/api/collections/{id}", UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Updated\",\"description\":\"New desc\"}"))
                .andExpect(status().isOk());
        verify(collectionService).updateCollection(any(UUID.class), any(CollectionRequest.class));
    }

    @Test
    void addSourceToCollection_returns200() throws Exception {
        UUID collectionId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        mockMvc.perform(post("/api/collections/{collectionId}/sources/{sourceId}", collectionId, sourceId))
                .andExpect(status().isOk());
        verify(documentService).addSourceToCollection(collectionId, sourceId);
    }

    @Test
    void getAvailableLibrarySources_passesPagingAndSearch() throws Exception {
        UUID collectionId = UUID.randomUUID();

        mockMvc.perform(get("/api/collections/{id}/library-sources", collectionId)
                        .param("page", "1")
                        .param("size", "25")
                        .param("sort", "originalFilename,asc")
                        .param("q", "review"))
                .andExpect(status().isOk());

        verify(documentService).getAvailableLibrarySources(
                collectionId, 1, 25, "originalFilename,asc", "review");
    }

    @Test
    void removeSourceFromCollection_returns204() throws Exception {
        UUID collectionId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();

        mockMvc.perform(delete("/api/collections/{collectionId}/sources/{sourceId}", collectionId, sourceId))
                .andExpect(status().isNoContent());

        verify(documentService).removeSourceFromCollection(collectionId, sourceId);
    }

    @Test
    void deleteCollection_returns204() throws Exception {
        UUID id = UUID.randomUUID();
        mockMvc.perform(delete("/api/collections/{id}", id)).andExpect(status().isNoContent());
        verify(collectionService).deleteCollection(id);
    }

    @Test
    void getCitationGraphUsesIncludeFailedByDefault() throws Exception {
        UUID id = UUID.randomUUID();

        mockMvc.perform(get("/api/collections/{id}/citation-graph", id))
                .andExpect(status().isOk());

        verify(openAlexIngestionService).getCitationGraph(id, true);
    }

    @Test
    void getCitationGraphPassesIncludeFailedParameter() throws Exception {
        UUID id = UUID.randomUUID();

        mockMvc.perform(get("/api/collections/{id}/citation-graph", id)
                        .param("includeFailed", "false"))
                .andExpect(status().isOk());

        verify(openAlexIngestionService).getCitationGraph(id, false);
    }
}
