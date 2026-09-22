package com.evidencepilot.service;

import com.evidencepilot.repository.ProjectDeletionCleanupTaskRepository;
import com.evidencepilot.repository.ProjectRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageRequest;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ProjectDeletionSweeperTest {

    @Mock
    private ProjectRepository projectRepository;

    @Mock
    private ProjectDeletionPurgeService purgeService;

    @Mock
    private ProjectDeletionCleanupTaskRepository cleanupTaskRepository;

    @Mock
    private ProjectDeletionCleanupService cleanupService;

    private ProjectDeletionSweeper sweeper;

    @BeforeEach
    void setUp() {
        sweeper = new ProjectDeletionSweeper(
                projectRepository,
                purgeService,
                cleanupTaskRepository,
                cleanupService
        );
    }

    @Test
    void sweepPurgesDueProjectsAndCleansUpDueTasks() {
        UUID proj1 = UUID.randomUUID();
        UUID proj2 = UUID.randomUUID();
        UUID task1 = UUID.randomUUID();
        UUID task2 = UUID.randomUUID();

        when(projectRepository.findIdsDueForDeletion(any(LocalDateTime.class), eq(PageRequest.of(0, 100))))
                .thenReturn(List.of(proj1, proj2));
        when(purgeService.purgeIfDue(eq(proj1), any(LocalDateTime.class))).thenReturn(true);
        when(purgeService.purgeIfDue(eq(proj2), any(LocalDateTime.class))).thenReturn(false);

        when(cleanupTaskRepository.findDueTaskIds(any(LocalDateTime.class), eq(PageRequest.of(0, 100))))
                .thenReturn(List.of(task1, task2));
        when(cleanupService.cleanupOne(eq(task1), any(LocalDateTime.class))).thenReturn(true);
        when(cleanupService.cleanupOne(eq(task2), any(LocalDateTime.class))).thenReturn(true);

        sweeper.sweep();

        verify(purgeService).purgeIfDue(eq(proj1), any(LocalDateTime.class));
        verify(purgeService).purgeIfDue(eq(proj2), any(LocalDateTime.class));
        verify(cleanupService).cleanupOne(eq(task1), any(LocalDateTime.class));
        verify(cleanupService).cleanupOne(eq(task2), any(LocalDateTime.class));
    }

    @Test
    void sweepIsIsolatedWhenPurgeOrCleanupFails() {
        UUID proj1 = UUID.randomUUID();
        UUID proj2 = UUID.randomUUID();
        UUID task1 = UUID.randomUUID();
        UUID task2 = UUID.randomUUID();

        when(projectRepository.findIdsDueForDeletion(any(LocalDateTime.class), eq(PageRequest.of(0, 100))))
                .thenReturn(List.of(proj1, proj2));
        doThrow(new RuntimeException("DB lock failure")).when(purgeService).purgeIfDue(eq(proj1), any(LocalDateTime.class));
        when(purgeService.purgeIfDue(eq(proj2), any(LocalDateTime.class))).thenReturn(true);

        when(cleanupTaskRepository.findDueTaskIds(any(LocalDateTime.class), eq(PageRequest.of(0, 100))))
                .thenReturn(List.of(task1, task2));
        doThrow(new RuntimeException("MinIO network timeout")).when(cleanupService).cleanupOne(eq(task1), any(LocalDateTime.class));
        when(cleanupService.cleanupOne(eq(task2), any(LocalDateTime.class))).thenReturn(true);

        sweeper.sweep();

        verify(purgeService).purgeIfDue(eq(proj1), any(LocalDateTime.class));
        verify(purgeService).purgeIfDue(eq(proj2), any(LocalDateTime.class));
        verify(cleanupService).cleanupOne(eq(task1), any(LocalDateTime.class));
        verify(cleanupService).cleanupOne(eq(task2), any(LocalDateTime.class));
    }

    @Test
    void sweepHandlesQueryExceptionsGracefully() {
        when(projectRepository.findIdsDueForDeletion(any(LocalDateTime.class), any()))
                .thenThrow(new RuntimeException("Query timed out"));
        when(cleanupTaskRepository.findDueTaskIds(any(LocalDateTime.class), any()))
                .thenThrow(new RuntimeException("Cleanup query timed out"));

        sweeper.sweep();

        verifyNoInteractions(purgeService, cleanupService);
    }
}
