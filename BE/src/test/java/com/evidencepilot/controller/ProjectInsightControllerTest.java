package com.evidencepilot.controller;

import com.evidencepilot.exception.ResourceNotFoundException;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.User;
import com.evidencepilot.repository.ProjectRepository;
import com.evidencepilot.service.CheckpointService;
import com.evidencepilot.service.CurrentUserService;
import com.evidencepilot.service.TraceTelemetryService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ProjectInsightControllerTest {

    @Mock private CheckpointService checkpointService;
    @Mock private TraceTelemetryService traceTelemetryService;
    @Mock private ProjectRepository projectRepository;
    @Mock private CurrentUserService currentUserService;

    @Test
    void checkpointMissingProjectStopsBeforeReadingDiff() {
        UUID projectId = UUID.randomUUID();
        when(currentUserService.requireCurrentUser()).thenReturn(new User());
        when(projectRepository.findById(projectId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> checkpointController().getDiff(projectId))
                .isInstanceOf(ResourceNotFoundException.class);

        verifyNoInteractions(checkpointService);
    }

    @Test
    void checkpointMissingSectionBaselineReturnsNotFound() {
        UUID projectId = UUID.randomUUID();
        UUID sectionId = UUID.randomUUID();
        User user = new User();
        Project project = new Project();
        project.setId(projectId);
        when(currentUserService.requireCurrentUser()).thenReturn(user);
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(project));

        var response = checkpointController().getLatestSectionBaseline(projectId, sectionId, null);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        verify(currentUserService).requireProjectAccess(user, project);
    }

    @Test
    void telemetryAccessDenialStopsBeforeReadingMetrics() {
        UUID projectId = UUID.randomUUID();
        User user = new User();
        Project project = new Project();
        project.setId(projectId);
        when(currentUserService.requireCurrentUser()).thenReturn(user);
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(project));
        doThrow(new ResponseStatusException(HttpStatus.FORBIDDEN, "Project access denied"))
                .when(currentUserService).requireEvidenceTraceReviewAccess(user, project);

        assertThatThrownBy(() -> telemetryController().telemetry(projectId))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        exception -> assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN));

        verifyNoInteractions(traceTelemetryService);
    }

    private CheckpointController checkpointController() {
        return new CheckpointController(checkpointService, projectRepository, currentUserService);
    }

    private TraceTelemetryController telemetryController() {
        return new TraceTelemetryController(traceTelemetryService, currentUserService, projectRepository);
    }
}
