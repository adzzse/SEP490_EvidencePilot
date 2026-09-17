package com.evidencepilot.controller;

import com.evidencepilot.dto.response.JobResponse;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.User;
import com.evidencepilot.repository.ProjectRepository;
import com.evidencepilot.service.AiEvaluationService;
import com.evidencepilot.service.impl.CurrentUserServiceImpl;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Optional;
import java.util.UUID;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

class JobControllerTest {

    private final AiEvaluationService aiEvaluationService = mock(AiEvaluationService.class);
    private final ProjectRepository projectRepository = mock(ProjectRepository.class);
    private final CurrentUserServiceImpl currentUserService = mock(CurrentUserServiceImpl.class);

    private MockMvc mockMvc() {
        return standaloneSetup(new JobController(aiEvaluationService, projectRepository, currentUserService)).build();
    }

    @Test
    void getJob_checksProjectAccessAndReturnsJob() throws Exception {
        UUID jobId = UUID.randomUUID();
        UUID projectId = UUID.randomUUID();
        ObjectNode result = new com.fasterxml.jackson.databind.ObjectMapper().createObjectNode();
        result.put("score", 3);
        JobResponse job = new JobResponse(
                jobId, projectId, "SECTION_SUGGESTION", "SUCCESS", 2, 9, result, null, null);
        User user = new User();
        Project project = new Project();
        when(aiEvaluationService.getJob(jobId)).thenReturn(job);
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(project));
        when(currentUserService.requireCurrentUser()).thenReturn(user);

        mockMvc().perform(get("/api/jobs/{jobId}", jobId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("SUCCESS"))
                .andExpect(jsonPath("$.progressCurrent").value(2))
                .andExpect(jsonPath("$.progressTotal").value(9))
                .andExpect(jsonPath("$.result.score").value(3));

        verify(currentUserService).requireProjectAccess(user, project);
    }
}
