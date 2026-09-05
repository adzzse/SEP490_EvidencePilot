package com.evidencepilot.controller;

import com.evidencepilot.dto.response.JobSubmitResponse;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.User;
import com.evidencepilot.service.AiEvaluationService;
import com.evidencepilot.service.CurrentUserService;
import com.evidencepilot.service.SectionStandardService;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class SectionStandardControllerTest {
    @Test
    void queuesAuthorizedSavedInputWithoutWaitingForGenerationAndRejectsForbiddenRequests() throws Exception {
        var standards = mock(SectionStandardService.class);
        var jobs = mock(AiEvaluationService.class);
        var users = mock(CurrentUserService.class);
        var mvc = MockMvcBuilders.standaloneSetup(new SectionStandardController(standards, jobs, users)).build();
        User actor = new User();
        actor.setId(UUID.randomUUID());
        Project project = new Project();
        project.setId(UUID.randomUUID());
        Document document = new Document();
        document.setId(UUID.randomUUID());
        document.setProject(project);
        PaperSection section = new PaperSection();
        section.setId(UUID.randomUUID());
        section.setDocument(document);
        UUID jobId = UUID.randomUUID();
        when(users.requireCurrentUser()).thenReturn(actor);
        when(standards.requireEvaluationAccess(document.getId(), section.getId(), actor)).thenReturn(section);
        when(standards.inputFingerprint(section)).thenReturn("saved-input");
        when(jobs.submitSectionSelfCheck(project.getId(), document.getId(), section.getId(), "saved-input", actor.getId()))
                .thenReturn(new JobSubmitResponse(jobId));
        String path = "/api/papers/" + document.getId() + "/sections/" + section.getId() + "/standard-evaluation/jobs";

        mvc.perform(post(path)).andExpect(status().isAccepted()).andExpect(jsonPath("$.jobId").value(jobId.toString()));
        verify(standards, never()).evaluate(document.getId(), section.getId());

        clearInvocations(jobs);
        when(standards.requireEvaluationAccess(document.getId(), section.getId(), actor))
                .thenThrow(new ResponseStatusException(HttpStatus.FORBIDDEN));
        mvc.perform(post(path)).andExpect(status().isForbidden());
        verifyNoInteractions(jobs);
    }
}
