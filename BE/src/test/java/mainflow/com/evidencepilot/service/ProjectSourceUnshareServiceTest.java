package com.evidencepilot.service;

import com.evidencepilot.model.Document;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.ProjectDocument;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.ProcessingStatus;
import com.evidencepilot.model.enums.ProjectStatus;
import com.evidencepilot.dto.response.ProjectSourceUnshareResponse;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.EvidenceRevisionTraceRepository;
import com.evidencepilot.repository.PaperReferenceRepository;
import com.evidencepilot.repository.ProjectDocumentRepository;
import com.evidencepilot.repository.ProjectRepository;
import com.evidencepilot.service.impl.CurrentUserServiceImpl;
import com.evidencepilot.service.impl.ProjectSourceUnshareService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ProjectSourceUnshareServiceTest {

    @Mock
    private ProjectRepository projectRepository;
    @Mock
    private ProjectDocumentRepository projectDocumentRepository;
    @Mock
    private DocumentRepository documentRepository;
    @Mock
    private PaperReferenceRepository paperReferenceRepository;
    @Mock
    private EvidenceRevisionTraceRepository evidenceRevisionTraceRepository;
    @Mock
    private CurrentUserServiceImpl currentUserService;
    @Mock
    private AuditService auditService;

    private Project project;
    private User instructor;

    @BeforeEach
    void setUp() {
        project = new Project();
        project.setId(UUID.randomUUID());
        project.setActive(true);
        project.setStatus(ProjectStatus.IN_PROGRESS);

        instructor = new User();
        instructor.setId(UUID.randomUUID());

        when(projectRepository.findById(project.getId())).thenReturn(Optional.of(project));
        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(currentUserService.isInstructor(instructor)).thenReturn(true);
    }

    @Test
    void removesMultipleProjectLinksWithoutDeletingSharedDocuments() {
        Document first = source(ProcessingStatus.READY);
        Document second = source(ProcessingStatus.COMPLETED);
        ProjectDocument firstLink = link(first);
        ProjectDocument secondLink = link(second);
        when(projectDocumentRepository.findByProjectIdAndDocumentId(project.getId(), first.getId()))
                .thenReturn(Optional.of(firstLink));
        when(projectDocumentRepository.findByProjectIdAndDocumentId(project.getId(), second.getId()))
                .thenReturn(Optional.of(secondLink));
        when(paperReferenceRepository.existsActiveForProject(any(), any())).thenReturn(false);
        when(evidenceRevisionTraceRepository.existsActiveForProjectAndSource(any(), any())).thenReturn(false);

        var result = service().unshare(project.getId(), List.of(first.getId(), second.getId()));

        assertThat(result.removedSourceIds()).containsExactly(first.getId(), second.getId());
        assertThat(result.blocked()).isEmpty();
        verify(projectDocumentRepository).delete(firstLink);
        verify(projectDocumentRepository).delete(secondLink);
        verify(documentRepository, never()).delete(any(Document.class));
        verify(auditService).record(eq("PROJECT_SOURCES_UNSHARED"), eq("PROJECT"), eq(project.getId()),
                eq(instructor), any(), any());
    }

    @Test
    void paperReferenceBlocksTheWholeSelectionBeforeAnyLinkIsRemoved() {
        Document safe = source(ProcessingStatus.READY);
        Document referenced = source(ProcessingStatus.READY);
        ProjectDocument safeLink = link(safe);
        ProjectDocument referencedLink = link(referenced);
        when(projectDocumentRepository.findByProjectIdAndDocumentId(project.getId(), safe.getId()))
                .thenReturn(Optional.of(safeLink));
        when(projectDocumentRepository.findByProjectIdAndDocumentId(project.getId(), referenced.getId()))
                .thenReturn(Optional.of(referencedLink));
        when(paperReferenceRepository.existsActiveForProject(project.getId(), referenced.getId())).thenReturn(true);
        when(paperReferenceRepository.existsActiveForProject(project.getId(), safe.getId())).thenReturn(false);
        when(evidenceRevisionTraceRepository.existsActiveForProjectAndSource(any(), any())).thenReturn(false);

        var result = service().unshare(project.getId(), List.of(safe.getId(), referenced.getId()));

        assertThat(result.removedSourceIds()).isEmpty();
        assertThat(result.blocked()).singleElement()
                .extracting(ProjectSourceUnshareResponse.BlockedSource::sourceId)
                .isEqualTo(referenced.getId());
        assertThat(result.blocked().getFirst().reason()).isEqualTo("PAPER_REFERENCE");
        verify(projectDocumentRepository, never()).delete(any(ProjectDocument.class));
    }

    @Test
    void evidenceReviewTraceBlocksUnsharing() {
        Document source = source(ProcessingStatus.READY);
        ProjectDocument sourceLink = link(source);
        when(projectDocumentRepository.findByProjectIdAndDocumentId(project.getId(), source.getId()))
                .thenReturn(Optional.of(sourceLink));
        when(paperReferenceRepository.existsActiveForProject(project.getId(), source.getId())).thenReturn(false);
        when(evidenceRevisionTraceRepository.existsActiveForProjectAndSource(project.getId(), source.getId()))
                .thenReturn(true);

        var result = service().unshare(project.getId(), List.of(source.getId()));

        assertThat(result.removedSourceIds()).isEmpty();
        assertThat(result.blocked()).singleElement()
                .extracting(ProjectSourceUnshareResponse.BlockedSource::reason)
                .isEqualTo("EVIDENCE_REVIEW");
        verify(projectDocumentRepository, never()).delete(any(ProjectDocument.class));
    }

    @Test
    void processingSourceIsBlockedUntilExtractionFinishes() {
        Document source = source(ProcessingStatus.PROCESSING);
        ProjectDocument sourceLink = link(source);
        when(projectDocumentRepository.findByProjectIdAndDocumentId(project.getId(), source.getId()))
                .thenReturn(Optional.of(sourceLink));

        var result = service().unshare(project.getId(), List.of(source.getId()));

        assertThat(result.removedSourceIds()).isEmpty();
        assertThat(result.blocked()).singleElement()
                .extracting(ProjectSourceUnshareResponse.BlockedSource::reason)
                .isEqualTo("SOURCE_NOT_READY");
        verify(projectDocumentRepository, never()).delete(any(ProjectDocument.class));
    }

    @Test
    void directProjectSourceLosesOnlyProjectOwnershipAndKeepsDocumentRow() {
        Document source = source(ProcessingStatus.READY);
        source.setProject(project);
        when(projectDocumentRepository.findByProjectIdAndDocumentId(project.getId(), source.getId()))
                .thenReturn(Optional.empty());
        when(documentRepository.findById(source.getId())).thenReturn(Optional.of(source));
        when(paperReferenceRepository.existsActiveForProject(project.getId(), source.getId())).thenReturn(false);
        when(evidenceRevisionTraceRepository.existsActiveForProjectAndSource(project.getId(), source.getId()))
                .thenReturn(false);

        var result = service().unshare(project.getId(), List.of(source.getId()));

        assertThat(result.removedSourceIds()).containsExactly(source.getId());
        assertThat(source.getProject()).isNull();
        verify(documentRepository).save(source);
        verify(documentRepository, never()).delete(any(Document.class));
    }

    private ProjectSourceUnshareService service() {
        return new ProjectSourceUnshareService(
                projectRepository,
                projectDocumentRepository,
                documentRepository,
                paperReferenceRepository,
                evidenceRevisionTraceRepository,
                currentUserService,
                auditService);
    }

    private ProjectDocument link(Document source) {
        ProjectDocument link = new ProjectDocument();
        link.setProject(project);
        link.setDocument(source);
        return link;
    }

    private Document source(ProcessingStatus status) {
        Document source = new Document();
        source.setId(UUID.randomUUID());
        source.setDocType(DocumentType.SOURCE);
        source.setActive(true);
        source.setProcessingStatus(status);
        return source;
    }
}
