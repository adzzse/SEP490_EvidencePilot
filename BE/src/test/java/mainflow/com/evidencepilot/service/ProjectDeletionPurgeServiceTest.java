package com.evidencepilot.service;

import com.evidencepilot.model.*;
import com.evidencepilot.model.ProjectDeletionCleanupTask.ResourceType;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ProjectDeletionPurgeServiceTest {

    @Mock
    private ProjectRepository projectRepository;

    @Mock
    private DocumentRepository documentRepository;

    @Mock
    private CollectionDocumentRepository collectionDocumentRepository;

    @Mock
    private ProjectDocumentRepository projectDocumentRepository;

    @Mock
    private ProjectMediaRepository projectMediaRepository;

    @Mock
    private FeedbackAttachmentRepository feedbackAttachmentRepository;

    @Mock
    private ExportJobRepository exportJobRepository;

    @Mock
    private PaperSectionRepository paperSectionRepository;

    @Mock
    private FeedbackRequestRepository feedbackRequestRepository;

    @Mock
    private InstructorFeedbackRepository instructorFeedbackRepository;

    @Mock
    private SystemNotificationRepository systemNotificationRepository;

    @Mock
    private ProjectDeletionCleanupTaskRepository cleanupTaskRepository;

    private ProjectDeletionPurgeService purgeService;

    @BeforeEach
    void setUp() {
        purgeService = new ProjectDeletionPurgeService(
                projectRepository,
                documentRepository,
                collectionDocumentRepository,
                projectDocumentRepository,
                projectMediaRepository,
                feedbackAttachmentRepository,
                exportJobRepository,
                paperSectionRepository,
                feedbackRequestRepository,
                instructorFeedbackRepository,
                systemNotificationRepository,
                cleanupTaskRepository
        );
    }

    private Project dueProject() {
        Project project = new Project();
        project.setId(UUID.randomUUID());
        project.setTitle("Due Project");
        project.setDeletionScheduledAt(LocalDateTime.now().minusMinutes(5));
        project.setActive(true);
        return project;
    }

    @Test
    void purgeDeletesExclusiveRowsAndQueuesCleanupButPreservesSharedSource() {
        LocalDateTime now = LocalDateTime.now();
        Project project = dueProject();

        Document paper = new Document();
        paper.setId(UUID.randomUUID());
        paper.setProject(project);
        paper.setDocType(DocumentType.PAPER);
        paper.setFileUrl("documents/paper.tex");
        paper.setFileHashSha256("1234567890123456789012345678901234567890123456789012345678901234");

        Document sharedSource = new Document();
        sharedSource.setId(UUID.randomUUID());
        sharedSource.setProject(project);
        sharedSource.setDocType(DocumentType.SOURCE);
        sharedSource.setFileUrl("documents/source.pdf");
        sharedSource.setFileHashSha256("abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd");

        Project otherProject = new Project();
        otherProject.setId(UUID.randomUUID());
        ProjectDocument link = new ProjectDocument();
        link.setId(UUID.randomUUID());
        link.setProject(otherProject);
        link.setDocument(sharedSource);

        ProjectMedia media = new ProjectMedia();
        media.setId(UUID.randomUUID());
        media.setProject(project);
        media.setStorageKey("media/image.png");

        ExportJob exportJob = new ExportJob();
        exportJob.setId(UUID.randomUUID());
        exportJob.setProjectId(project.getId());

        when(projectRepository.findByIdForUpdate(project.getId())).thenReturn(Optional.of(project));
        when(documentRepository.findByProjectId(project.getId())).thenReturn(List.of(paper, sharedSource));
        when(collectionDocumentRepository.findByDocumentId(paper.getId())).thenReturn(List.of());
        when(projectDocumentRepository.findByDocumentId(paper.getId())).thenReturn(List.of());

        when(collectionDocumentRepository.findByDocumentId(sharedSource.getId())).thenReturn(List.of());
        when(projectDocumentRepository.findByDocumentId(sharedSource.getId())).thenReturn(List.of(link));

        when(projectMediaRepository.findByProjectId(project.getId())).thenReturn(List.of(media));
        when(feedbackAttachmentRepository.findStorageKeysByProjectId(project.getId())).thenReturn(List.of("feedback/att.png"));
        when(exportJobRepository.findByProjectId(project.getId())).thenReturn(List.of(exportJob));

        PaperSection section = new PaperSection();
        section.setId(UUID.randomUUID());
        when(paperSectionRepository.findByDocument_Project_IdOrderByDocument_IdAscSectionOrderAsc(project.getId()))
                .thenReturn(List.of(section));

        FeedbackRequest request = new FeedbackRequest();
        request.setId(UUID.randomUUID());
        when(feedbackRequestRepository.findByProjectIdOrderByRequestedAtDesc(project.getId())).thenReturn(List.of(request));

        InstructorFeedback feedback = new InstructorFeedback();
        feedback.setId(UUID.randomUUID());
        when(instructorFeedbackRepository.findByRequestProjectId(project.getId())).thenReturn(List.of(feedback));

        boolean purged = purgeService.purgeIfDue(project.getId(), now);

        assertThat(purged).isTrue();

        // Preserved shared document detached, exclusive document deleted
        verify(documentRepository).delete(paper);
        verify(documentRepository, never()).delete(sharedSource);
        assertThat(sharedSource.getProject()).isNull();
        verify(documentRepository).saveAll(List.of(sharedSource));

        // System notifications purged with both entity and feedback IDs
        verify(systemNotificationRepository).deleteByEntityIdInOrFeedbackIdIn(any(), any());

        // Tasks captured and saved
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<ProjectDeletionCleanupTask>> captor = ArgumentCaptor.forClass(List.class);
        verify(cleanupTaskRepository).saveAll(captor.capture());
        List<ProjectDeletionCleanupTask> savedTasks = captor.getValue();

        assertThat(savedTasks).isNotEmpty();
        assertThat(savedTasks).anyMatch(t -> t.getResourceType() == ResourceType.MINIO_OBJECT && t.getResourceKey().equals("documents/paper.tex"));
        assertThat(savedTasks).anyMatch(t -> t.getResourceType() == ResourceType.QDRANT_DOCUMENT && t.getResourceKey().equals(paper.getId().toString()));
        assertThat(savedTasks).anyMatch(t -> t.getResourceType() == ResourceType.MINIO_OBJECT_IF_HASH_UNUSED && t.getGuardKey().equals(paper.getFileHashSha256()));
        assertThat(savedTasks).anyMatch(t -> t.getResourceType() == ResourceType.MINIO_OBJECT && t.getResourceKey().equals("media/image.png"));
        assertThat(savedTasks).anyMatch(t -> t.getResourceType() == ResourceType.MINIO_OBJECT && t.getResourceKey().equals("feedback/att.png"));
        assertThat(savedTasks).anyMatch(t -> t.getResourceType() == ResourceType.MINIO_OBJECT && t.getResourceKey().equals("exports/" + exportJob.getId() + ".zip"));

        // None for shared source
        assertThat(savedTasks).noneMatch(t -> t.getResourceKey().equals("documents/source.pdf"));
        assertThat(savedTasks).noneMatch(t -> t.getResourceKey().equals(sharedSource.getId().toString()));

        // Project physically deleted
        verify(projectRepository).delete(project);
    }

    @Test
    void lockedProjectWithRevokedOrFutureDeadlineIsNotPurged() {
        LocalDateTime now = LocalDateTime.now();
        Project project = dueProject();

        // 1. Revoked deadline
        project.setDeletionScheduledAt(null);
        when(projectRepository.findByIdForUpdate(project.getId())).thenReturn(Optional.of(project));
        assertThat(purgeService.purgeIfDue(project.getId(), now)).isFalse();
        verify(projectRepository, never()).delete(any(Project.class));

        // 2. Future deadline
        project.setDeletionScheduledAt(now.plusMinutes(5));
        assertThat(purgeService.purgeIfDue(project.getId(), now)).isFalse();
        verify(projectRepository, never()).delete(any(Project.class));

        // 3. Not found
        UUID unknownId = UUID.randomUUID();
        when(projectRepository.findByIdForUpdate(unknownId)).thenReturn(Optional.empty());
        assertThat(purgeService.purgeIfDue(unknownId, now)).isFalse();
    }

    @Test
    void preservedDocumentInCollectionIsNotDeleted() {
        LocalDateTime now = LocalDateTime.now();
        Project project = dueProject();

        com.evidencepilot.model.Collection col = new com.evidencepilot.model.Collection();
        col.setId(UUID.randomUUID());

        Document colDoc = new Document();
        colDoc.setId(UUID.randomUUID());
        colDoc.setProject(project);
        colDoc.setCollection(col);
        colDoc.setDocType(DocumentType.SOURCE);

        when(projectRepository.findByIdForUpdate(project.getId())).thenReturn(Optional.of(project));
        when(documentRepository.findByProjectId(project.getId())).thenReturn(List.of(colDoc));
        when(projectMediaRepository.findByProjectId(project.getId())).thenReturn(List.of());
        when(feedbackAttachmentRepository.findStorageKeysByProjectId(project.getId())).thenReturn(List.of());
        when(exportJobRepository.findByProjectId(project.getId())).thenReturn(List.of());
        when(paperSectionRepository.findByDocument_Project_IdOrderByDocument_IdAscSectionOrderAsc(project.getId())).thenReturn(List.of());
        when(feedbackRequestRepository.findByProjectIdOrderByRequestedAtDesc(project.getId())).thenReturn(List.of());
        when(instructorFeedbackRepository.findByRequestProjectId(project.getId())).thenReturn(List.of());

        boolean purged = purgeService.purgeIfDue(project.getId(), now);
        assertThat(purged).isTrue();

        verify(documentRepository, never()).delete(colDoc);
        assertThat(colDoc.getProject()).isNull();
        verify(documentRepository).saveAll(List.of(colDoc));
        verify(projectRepository).delete(project);
    }
}
