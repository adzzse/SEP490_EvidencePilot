package com.evidencepilot.service;

import com.evidencepilot.service.impl.CurrentUserServiceImpl;
import com.evidencepilot.config.infrastructure.RabbitMQConfig;
import com.evidencepilot.dto.ExportRequest;
import com.evidencepilot.dto.response.ProgressReportResponse;
import com.evidencepilot.dto.response.TraceabilityExportResponse;
import com.evidencepilot.model.ExportJob;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.ExportFormat;
import com.evidencepilot.model.enums.ExportStatus;
import com.evidencepilot.repository.ExportJobRepository;
import com.evidencepilot.repository.ProjectRepository;
import com.evidencepilot.repository.UserRepository;
import com.evidencepilot.service.impl.ExportServiceImpl;
import com.evidencepilot.service.impl.ProjectCsvArchive;
import com.evidencepilot.service.impl.TraceabilityExportServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.server.ResponseStatusException;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.longThat;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class ExportServiceImplTest {

    private final ExportJobRepository exportJobs = mock(ExportJobRepository.class);
    private final ProjectRepository projects = mock(ProjectRepository.class);
    private final CurrentUserServiceImpl currentUsers = mock(CurrentUserServiceImpl.class);
    private final SystemNotificationService notifications = mock(SystemNotificationService.class);
    private final DocumentObjectStorage storage = mock(DocumentObjectStorage.class);
    private final UserRepository users = mock(UserRepository.class);
    private final RabbitTemplate rabbitTemplate = mock(RabbitTemplate.class);
    private final TexArchiveBuilder texArchiveBuilder = mock(TexArchiveBuilder.class);
    private final TraceabilityExportServiceImpl projectDataService = mock(TraceabilityExportServiceImpl.class);
    private ExportServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new ExportServiceImpl(
                exportJobs, projects, currentUsers, notifications, storage,
                users, rabbitTemplate, texArchiveBuilder, projectDataService);
    }

    @Test
    void processExportStreamsCompletedArchiveWithItsExactSize() throws Exception {
        ExportJob job = job(ExportStatus.PENDING);
        Project project = new Project();
        project.setId(job.getProjectId());
        project.setTitle("Streaming export");
        User exportUser = new User();
        exportUser.setId(job.getUserId());
        when(users.findById(job.getUserId())).thenReturn(Optional.of(exportUser));
        when(projects.findById(job.getProjectId())).thenReturn(Optional.of(project));
        doAnswer(invocation -> {
            Path destination = invocation.getArgument(1);
            try (ZipOutputStream archive = new ZipOutputStream(
                    Files.newOutputStream(destination), StandardCharsets.UTF_8)) {
                archive.putNextEntry(new ZipEntry("main.tex"));
                archive.write("\\title{Streaming export}".getBytes(StandardCharsets.UTF_8));
                archive.closeEntry();
                archive.putNextEntry(new ZipEntry("images/figure.jpg"));
                archive.write(new byte[] {1, 2, 3});
                archive.closeEntry();
            }
            return null;
        }).when(texArchiveBuilder).write(eq(job.getProjectId()), any(Path.class), eq(exportUser));
        var uploaded = new ByteArrayOutputStream();
        var uploadedSize = new AtomicLong();
        doAnswer(invocation -> {
            InputStream content = invocation.getArgument(1);
            uploadedSize.set(invocation.getArgument(2));
            content.transferTo(uploaded);
            return null;
        }).when(storage).write(
                eq("exports/" + job.getId() + ".zip"),
                any(InputStream.class),
                longThat(size -> size > 0),
                eq("application/zip"));

        service.processExport(job);

        assertThat(job.getStatus()).isEqualTo(ExportStatus.READY);
        assertThat(job.getDownloadUrl()).isEqualTo("/api/exports/" + job.getId() + "/download");
        assertThat(uploadedSize.get()).isEqualTo(uploaded.size());
        try (var zip = new ZipInputStream(
                new ByteArrayInputStream(uploaded.toByteArray()),
                StandardCharsets.UTF_8)) {
            assertThat(zip.getNextEntry().getName()).isEqualTo("main.tex");
            assertThat(new String(zip.readAllBytes(), StandardCharsets.UTF_8))
                    .contains("\\title{Streaming export}");
            assertThat(zip.getNextEntry().getName()).isEqualTo("images/figure.jpg");
            assertThat(zip.readAllBytes()).containsExactly(1, 2, 3);
        }
        verify(storage).write(
                eq("exports/" + job.getId() + ".zip"),
                any(InputStream.class),
                longThat(size -> size > 0),
                eq("application/zip"));
        verify(storage, never()).write(anyString(), any(byte[].class), anyString());
        verify(storage, never()).presignedGetUrl(anyString(), any(Integer.class));
    }

    @Test
    void processCsvExportStoresTheSameTableArchiveAsTheDirectDownload() throws Exception {
        ExportJob job = job(ExportStatus.PENDING);
        job.setFormat(ExportFormat.TRACEABILITY_CSV);
        User exportUser = new User();
        exportUser.setId(job.getUserId());
        when(users.findById(job.getUserId())).thenReturn(Optional.of(exportUser));
        TraceabilityExportResponse data = mock(TraceabilityExportResponse.class);
        when(data.projectTitle()).thenReturn("=1+1\nnext");
        when(data.papers()).thenReturn(List.of());
        when(data.sections()).thenReturn(List.of());
        when(data.sources()).thenReturn(List.of());
        when(data.sourceReferences()).thenReturn(List.of());
        when(data.externalReferences()).thenReturn(List.of());
        when(data.sourceRelations()).thenReturn(List.of());
        when(data.feedback()).thenReturn(List.of());
        when(data.feedbackComments()).thenReturn(List.of());
        when(data.feedbackReplies()).thenReturn(List.of());
        when(data.feedbackAttachments()).thenReturn(List.of());
        when(data.traces()).thenReturn(List.of());
        when(data.memberProgress()).thenReturn(List.of(new ProgressReportResponse.MemberContribution(
                UUID.randomUUID(), "Member", 0, 0, 0, 0, 0, 0, null, 0, 0,
                List.of("=SUM(1,1)\nnext"), List.of())));
        doAnswer(invocation -> {
            Path destination = invocation.getArgument(2);
            try (ZipOutputStream zip = new ZipOutputStream(Files.newOutputStream(destination), StandardCharsets.UTF_8)) {
                ProjectCsvArchive.writeEntries(data, zip, "");
            }
            return null;
        }).when(projectDataService).writeCsvArchiveForJob(eq(job.getProjectId()), eq(exportUser), any(Path.class));
        var uploaded = new ByteArrayOutputStream();
        doAnswer(invocation -> {
            InputStream content = invocation.getArgument(1);
            content.transferTo(uploaded);
            return null;
        }).when(storage).write(eq("exports/" + job.getId() + ".zip"), any(InputStream.class),
                longThat(size -> size > 0), eq("application/zip"));

        service.processExport(job);

        assertThat(job.getStatus()).isEqualTo(ExportStatus.READY);
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(uploaded.toByteArray()), StandardCharsets.UTF_8)) {
            String projectCsv = null;
            String memberCsv = null;
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                if (entry.getName().equals("project.csv")) projectCsv = new String(zip.readAllBytes(), StandardCharsets.UTF_8);
                if (entry.getName().equals("member-progress.csv")) memberCsv = new String(zip.readAllBytes(), StandardCharsets.UTF_8);
            }
            assertThat(projectCsv).contains("project_id", "'=1+1\nnext");
            assertThat(memberCsv).contains("'=SUM(1,1)\nnext");
        }
    }

    @Test
    void downloadExportStreamsReadyArchiveFromObjectStorage() throws Exception {
        ExportJob job = job(ExportStatus.READY);
        User currentUser = new User();
        Project project = new Project();
        project.setId(job.getProjectId());
        byte[] archive = {4, 5, 6};
        when(currentUsers.requireCurrentUser()).thenReturn(currentUser);
        when(exportJobs.findById(job.getId())).thenReturn(Optional.of(job));
        when(projects.findById(job.getProjectId())).thenReturn(Optional.of(project));
        when(storage.getStream("exports/" + job.getId() + ".zip"))
                .thenReturn(new ByteArrayInputStream(archive));

        Resource result = service.downloadExport(job.getId());

        assertThat(result.getInputStream().readAllBytes()).containsExactly(archive);
        verify(storage).getStream("exports/" + job.getId() + ".zip");
        verify(storage, never()).read(anyString());
    }

    @Test
    void getJobReplacesExpiredLegacyUrlWithAuthenticatedDownloadEndpoint() {
        ExportJob job = job(ExportStatus.READY);
        job.setDownloadUrl("http://minio.example/expired-signature");
        User currentUser = new User();
        Project project = new Project();
        project.setId(job.getProjectId());
        when(currentUsers.requireCurrentUser()).thenReturn(currentUser);
        when(exportJobs.findById(job.getId())).thenReturn(Optional.of(job));
        when(projects.findById(job.getProjectId())).thenReturn(Optional.of(project));

        ExportJob result = service.getJob(job.getId());

        assertThat(result.getDownloadUrl()).isEqualTo(
                "/api/exports/" + job.getId() + "/download");
    }

    @Test
    void downloadExportRejectsUnauthorizedProjectAccessBeforeOpeningStorage() {
        ExportJob job = job(ExportStatus.READY);
        User currentUser = new User();
        Project project = new Project();
        project.setId(job.getProjectId());
        var denied = new ResponseStatusException(HttpStatus.FORBIDDEN, "Project access denied");
        when(currentUsers.requireCurrentUser()).thenReturn(currentUser);
        when(exportJobs.findById(job.getId())).thenReturn(Optional.of(job));
        when(projects.findById(job.getProjectId())).thenReturn(Optional.of(project));
        doThrow(denied).when(currentUsers).requireProjectAccess(currentUser, project);

        assertThatThrownBy(() -> service.downloadExport(job.getId()))
                .isSameAs(denied);
        verify(storage, never()).getStream(anyString());
    }

    @Test
    void downloadExportRejectsAnotherProjectMemberBeforeOpeningStorage() {
        ExportJob job = job(ExportStatus.READY);
        User currentUser = new User();
        currentUser.setId(UUID.randomUUID());
        Project project = new Project();
        project.setId(job.getProjectId());
        var denied = new ResponseStatusException(HttpStatus.FORBIDDEN, "Not your export");
        when(currentUsers.requireCurrentUser()).thenReturn(currentUser);
        when(exportJobs.findById(job.getId())).thenReturn(Optional.of(job));
        when(projects.findById(job.getProjectId())).thenReturn(Optional.of(project));
        doThrow(denied).when(currentUsers).requireUserIdOrAdmin(currentUser, job.getUserId());

        assertThatThrownBy(() -> service.downloadExport(job.getId())).isSameAs(denied);
        verify(storage, never()).getStream(anyString());
    }

    @Test
    void createExportJobPublishesOnlyAfterTransactionCommit() {
        UUID projectId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        UUID jobId = UUID.randomUUID();
        User currentUser = new User();
        currentUser.setId(userId);
        Project project = new Project();
        project.setId(projectId);
        when(currentUsers.requireCurrentUser()).thenReturn(currentUser);
        when(projects.findById(projectId)).thenReturn(Optional.of(project));
        when(exportJobs.save(any(ExportJob.class))).thenAnswer(invocation -> {
            ExportJob job = invocation.getArgument(0);
            job.setId(jobId);
            return job;
        });

        TransactionSynchronizationManager.initSynchronization();
        try {
            ExportJob job = service.createExportJob(projectId, "tex");

            assertThat(job.getProjectId()).isEqualTo(projectId);
            assertThat(job.getUserId()).isEqualTo(userId);
            assertThat(job.getStatus()).isEqualTo(ExportStatus.PENDING);
            assertThat(job.getFormat()).isEqualTo(ExportFormat.TEX);
            verifyNoInteractions(rabbitTemplate);

            var synchronizations = TransactionSynchronizationManager.getSynchronizations();
            assertThat(synchronizations).hasSize(1);
            synchronizations.getFirst().afterCommit();

            verify(rabbitTemplate, times(1)).convertAndSend(
                    RabbitMQConfig.EXPORT_QUEUE,
                    new ExportRequest(jobId, projectId, userId, "tex"));
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    void retryFailedExportClaimsJobAndPublishesOnlyAfterCommit() {
        ExportJob job = job(ExportStatus.FAILED);
        job.setFormat(ExportFormat.TEX);
        job.setErrorMessage("renderer unavailable");
        User currentUser = new User();
        Project project = new Project();
        project.setId(job.getProjectId());
        when(currentUsers.requireCurrentUser()).thenReturn(currentUser);
        when(exportJobs.findById(job.getId())).thenReturn(Optional.of(job));
        when(projects.findById(job.getProjectId())).thenReturn(Optional.of(project));
        when(exportJobs.retryFailed(
                eq(job.getId()), eq(ExportStatus.FAILED), eq(ExportStatus.PENDING), any()))
                .thenReturn(1);

        TransactionSynchronizationManager.initSynchronization();
        try {
            ExportJob retried = service.retryExport(job.getId());

            assertThat(retried.getStatus()).isEqualTo(ExportStatus.PENDING);
            assertThat(retried.getErrorMessage()).isNull();
            verifyNoInteractions(rabbitTemplate);

            var synchronizations = TransactionSynchronizationManager.getSynchronizations();
            assertThat(synchronizations).hasSize(1);
            synchronizations.getFirst().afterCommit();

            verify(rabbitTemplate).convertAndSend(
                    RabbitMQConfig.EXPORT_QUEUE,
                    new ExportRequest(job.getId(), job.getProjectId(), job.getUserId(), "tex"));
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    void retryExportRejectsJobAlreadyClaimedByAnotherRequest() {
        ExportJob job = job(ExportStatus.FAILED);
        User currentUser = new User();
        Project project = new Project();
        project.setId(job.getProjectId());
        when(currentUsers.requireCurrentUser()).thenReturn(currentUser);
        when(exportJobs.findById(job.getId())).thenReturn(Optional.of(job));
        when(projects.findById(job.getProjectId())).thenReturn(Optional.of(project));
        when(exportJobs.retryFailed(
                eq(job.getId()), eq(ExportStatus.FAILED), eq(ExportStatus.PENDING), any()))
                .thenReturn(0);

        assertThatThrownBy(() -> service.retryExport(job.getId()))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(error -> ((ResponseStatusException) error).getStatusCode())
                .isEqualTo(HttpStatus.CONFLICT);
        verifyNoInteractions(rabbitTemplate);
    }

    private static ExportJob job(ExportStatus status) {
        ExportJob job = new ExportJob();
        job.setId(UUID.randomUUID());
        job.setProjectId(UUID.randomUUID());
        job.setUserId(UUID.randomUUID());
        job.setStatus(status);
        return job;
    }
}
