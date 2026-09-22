package com.evidencepilot.controller;

import com.evidencepilot.dto.response.DocumentResponse;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.repository.EvidenceRevisionTraceRepository;
import com.evidencepilot.repository.PaperReferenceRepository;
import com.evidencepilot.repository.ProjectDocumentRepository;
import com.evidencepilot.repository.ProjectRepository;
import com.evidencepilot.service.impl.CurrentUserServiceImpl;
import com.evidencepilot.service.impl.DocumentServiceImpl;
import com.evidencepilot.service.impl.ProjectSourceUnshareService;
import com.evidencepilot.dto.response.ProjectSourceUnshareResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

class SourceControllerTest {

    private final DocumentServiceImpl service = mock(DocumentServiceImpl.class);
    private final ProjectDocumentRepository projectDocumentRepository = mock(ProjectDocumentRepository.class);
    private final CurrentUserServiceImpl currentUserService = mock(CurrentUserServiceImpl.class);
    private final ProjectRepository projectRepository = mock(ProjectRepository.class);
    private final ProjectSourceUnshareService projectSourceUnshareService = mock(ProjectSourceUnshareService.class);
    private final PaperReferenceRepository paperReferenceRepository = mock(PaperReferenceRepository.class);
    private final EvidenceRevisionTraceRepository evidenceRevisionTraceRepository = mock(EvidenceRevisionTraceRepository.class);
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = standaloneSetup(new SourceController(service,
                        projectDocumentRepository, paperReferenceRepository, evidenceRevisionTraceRepository,
                        currentUserService, projectRepository, projectSourceUnshareService))
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void bulkUnshareReturnsRemovedIds() throws Exception {
        UUID projectId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        when(projectSourceUnshareService.unshare(projectId, List.of(sourceId)))
                .thenReturn(new ProjectSourceUnshareResponse(List.of(sourceId), List.of()));

        mockMvc.perform(post("/api/sources/projects/{projectId}/unshare", projectId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sourceIds\":[\"" + sourceId + "\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.removedSourceIds[0]").value(sourceId.toString()))
                .andExpect(jsonPath("$.blocked").isEmpty());

        verify(projectSourceUnshareService).unshare(projectId, List.of(sourceId));
    }

    @Test
    void bulkUnshareUsesConflictWhenAnySourceIsBlocked() throws Exception {
        UUID projectId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        when(projectSourceUnshareService.unshare(projectId, List.of(sourceId)))
                .thenReturn(new ProjectSourceUnshareResponse(
                        List.of(),
                        List.of(new ProjectSourceUnshareResponse.BlockedSource(
                                sourceId, "PAPER_REFERENCE", 1))));

        mockMvc.perform(post("/api/sources/projects/{projectId}/unshare", projectId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sourceIds\":[\"" + sourceId + "\"]}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.blocked[0].sourceId").value(sourceId.toString()))
                .andExpect(jsonPath("$.blocked[0].reason").value("PAPER_REFERENCE"));
    }

    @Test
    void findByProject_marksReferencedSources() throws Exception {
        UUID projectId = UUID.randomUUID();
        Project project = new Project();
        project.setId(projectId);
        Document plain = source("Plain");
        Document cited = source("Cited");
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(project));
        when(service.getDocumentsByProject(projectId))
                .thenReturn(List.of(DocumentResponse.from(plain), DocumentResponse.from(cited)));
        when(projectDocumentRepository.findByProjectId(projectId)).thenReturn(List.of());
        when(paperReferenceRepository.existsActiveForProject(projectId, plain.getId())).thenReturn(false);
        when(paperReferenceRepository.existsActiveForProject(projectId, cited.getId())).thenReturn(true);
        when(evidenceRevisionTraceRepository.existsActiveForProjectAndSource(eq(projectId), any(UUID.class)))
                .thenReturn(false);

        mockMvc.perform(get("/api/sources/projects/{projectId}", projectId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].referenced").value(false))
                .andExpect(jsonPath("$[1].referenced").value(true));
    }

    private static Document source(String title) {
        Document document = new Document();
        document.setId(UUID.randomUUID());
        document.setTitle(title);
        document.setDocType(DocumentType.SOURCE);
        document.setActive(true);
        return document;
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
