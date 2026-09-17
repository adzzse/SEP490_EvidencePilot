package com.evidencepilot.controller;

import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.repository.ProjectDocumentRepository;
import com.evidencepilot.repository.ProjectRepository;
import com.evidencepilot.service.impl.CurrentUserServiceImpl;
import com.evidencepilot.service.impl.DocumentServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

class SourceControllerTest {

    private final DocumentServiceImpl service = mock(DocumentServiceImpl.class);
    private final ProjectDocumentRepository projectDocumentRepository = mock(ProjectDocumentRepository.class);
    private final CurrentUserServiceImpl currentUserService = mock(CurrentUserServiceImpl.class);
    private final ProjectRepository projectRepository = mock(ProjectRepository.class);
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = standaloneSetup(new SourceController(service,
                        projectDocumentRepository, currentUserService, projectRepository))
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void findById_delegatesId() throws Exception {
        UUID id = UUID.randomUUID();
        mockMvc.perform(get("/api/sources/{id}", id)).andExpect(status().isOk());
        verify(service).getSourceById(id);
    }

    @Test
    void findLibrary_passesPagingSearchAndStatus() throws Exception {
        mockMvc.perform(get("/api/sources")
                        .param("page", "2")
                        .param("size", "15")
                        .param("sort", "title,asc")
                        .param("q", "evidence")
                        .param("processingStatus", "READY"))
                .andExpect(status().isOk());

        verify(service).getSourceLibrary(
                2, 15, "title,asc", "evidence",
                com.evidencepilot.model.enums.ProcessingStatus.READY);
    }

    @Test
    void update_bindsValidatedTitle() throws Exception {
        UUID id = UUID.randomUUID();

        mockMvc.perform(put("/api/sources/{id}", id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"Updated evidence\"}"))
                .andExpect(status().isOk());

        verify(service).updateSource(id, "Updated evidence");
    }

    @Test
    void update_rejectsBlankTitle() throws Exception {
        mockMvc.perform(put("/api/sources/{id}", UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"   \"}"))
                .andExpect(status().isBadRequest());

        verify(service, never()).updateSource(any(), any());
    }

    @Test
    void delete_delegatesId() throws Exception {
        UUID id = UUID.randomUUID();

        mockMvc.perform(delete("/api/sources/{id}", id))
                .andExpect(status().isNoContent());

        verify(service).deleteSource(id);
    }

    @Test
    void upload_bindsAllOptionalScopes() throws Exception {
        UUID projectId = UUID.randomUUID();
        UUID collectionId = UUID.randomUUID();
        MockMultipartFile file = new MockMultipartFile("file", "source.pdf", "application/pdf", "pdf".getBytes());

        mockMvc.perform(multipart("/api/sources").file(file)
                        .param("projectId", projectId.toString())
                        .param("collectionId", collectionId.toString()))
                .andExpect(status().isCreated());

        verify(service).uploadDocument(
                eq(projectId), eq(collectionId), any(), eq(DocumentType.SOURCE));
    }
}
