package com.evidencepilot.service.impl;

import com.evidencepilot.dto.response.PaperReferenceCheckResponse;
import com.evidencepilot.dto.response.PaperReferenceResponse;
import com.evidencepilot.exception.ResourceNotFoundException;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.PaperReference;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.ProjectMember;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.ProcessingStatus;
import com.evidencepilot.model.enums.ProjectRole;
import com.evidencepilot.model.enums.ProjectStatus;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.PaperReferenceRepository;
import com.evidencepilot.repository.PaperSectionRepository;
import com.evidencepilot.repository.ProjectDocumentRepository;
import com.evidencepilot.repository.ProjectMemberRepository;
import com.evidencepilot.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
class PaperReferenceServiceTest {

    private final DocumentRepository documentRepository = mock(DocumentRepository.class);
    private final PaperReferenceRepository paperReferenceRepository = mock(PaperReferenceRepository.class);
    private final PaperSectionRepository paperSectionRepository = mock(PaperSectionRepository.class);
    private final ProjectDocumentRepository projectDocumentRepository = mock(ProjectDocumentRepository.class);
    private final ProjectMemberRepository projectMemberRepository = mock(ProjectMemberRepository.class);
    private final SourceMatchingService sourceMatchingService = mock(SourceMatchingService.class);
    private final UserRepository userRepository = mock(UserRepository.class);
    private final CurrentUserServiceImpl currentUserService = mock(CurrentUserServiceImpl.class);

    private PaperReferenceService service;
    private Project project;
    private Document paper;
    private User leader;
    private UUID projectId;
    private UUID paperId;
    private UUID leaderId;

    @BeforeEach
    void setUp() {
        service = new PaperReferenceService(documentRepository, paperReferenceRepository,
                paperSectionRepository, projectDocumentRepository, projectMemberRepository,
                sourceMatchingService, userRepository, currentUserService);
        projectId = UUID.randomUUID();
        paperId = UUID.randomUUID();
        leaderId = UUID.randomUUID();
        project = new Project();
        project.setId(projectId);
        project.setStatus(ProjectStatus.ASSIGNED);
        paper = new Document();
        paper.setId(paperId);
        paper.setDocType(DocumentType.PAPER);
        paper.setActive(true);
        paper.setProject(project);
        leader = new User();
        leader.setId(leaderId);
        leader.setRole(UserRole.STUDENT);
        when(userRepository.findById(leaderId)).thenReturn(Optional.of(leader));
        when(documentRepository.findById(paperId)).thenReturn(Optional.of(paper));
        when(documentRepository.findByIdForUpdate(paperId)).thenReturn(Optional.of(paper));
        when(projectMemberRepository.findByProjectIdAndUserId(projectId, leaderId))
                .thenReturn(List.of(member(ProjectRole.LEADER)));
    }

    @Test
    void checkMatchesDoiCitationKeyAndUniqueTitleYearInReferenceOrder() {
        Document ready = source(ProcessingStatus.READY, "ready.pdf");
        ready.setDoi("10.1000/ready");
        ready.setTitle("Reliable Evidence Retrieval for Research Writing");
        ready.setPublicationYear(2024);
        Document missingFile = source(ProcessingStatus.METADATA_FETCHED, "pending");
        Document processing = source(ProcessingStatus.PROCESSING, "processing.pdf");
        processing.setTitle("Structured Citation Checking in Collaborative Editors");
        processing.setPublicationYear(2025);
        Document unavailable = source(ProcessingStatus.FAILED, "failed.pdf");
        unavailable.setDoi("10.1000/failed");

        when(paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(paperId))
                .thenReturn(List.of(referenceSection("""
                        A. Author. Reliable Evidence Retrieval for Research Writing. 2024. https://doi.org/10.1000/READY.

                        \\bibitem{%s} Metadata-only work.

                        \\bibitem{processing} B. Author. Structured Citation Checking in Collaborative Editors. 2025.

                        \\bibitem{failed} C. Author. Failed extraction work. https://doi.org/10.1000/failed.
                        """.formatted(SourceMatchingService.citationKey(missingFile.getId())))));
        when(sourceMatchingService.activeSources(projectId))
                .thenReturn(List.of(ready, missingFile, processing, unavailable));
        when(sourceMatchingService.referenceSources(paperId)).thenReturn(List.of(ready));

        PaperReferenceCheckResponse result = service.check(paperId, leaderId);

        assertThat(result.referenceSectionFound()).isTrue();
        assertThat(result.items()).extracting(PaperReferenceCheckResponse.Item::status)
                .containsExactly(
                        PaperReferenceCheckResponse.Status.READY,
                        PaperReferenceCheckResponse.Status.MISSING_FILE,
                        PaperReferenceCheckResponse.Status.PROCESSING,
                        PaperReferenceCheckResponse.Status.UNAVAILABLE);
        assertThat(result.items()).extracting(PaperReferenceCheckResponse.Item::matchReason)
                .containsExactly(
                        PaperReferenceCheckResponse.MatchReason.DOI,
                        PaperReferenceCheckResponse.MatchReason.CITATION_KEY,
                        PaperReferenceCheckResponse.MatchReason.TITLE_YEAR,
                        PaperReferenceCheckResponse.MatchReason.DOI);
        assertThat(result.summary().matchedNotDeclared()).isEqualTo(3);
    }

    @Test
    void checkKeepsEachBibitemAsOneEntryWhenItsTextHasBlankLines() {
        Document first = source(ProcessingStatus.READY, "first.pdf");
        Document second = source(ProcessingStatus.READY, "second.pdf");
        String firstKey = SourceMatchingService.citationKey(first.getId());
        String secondKey = SourceMatchingService.citationKey(second.getId());
        when(paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(paperId))
                .thenReturn(List.of(referenceSection("""
                        \\begin{thebibliography}{9}
                        \\bibitem{%s} First paragraph of one reference.

                        Second paragraph of the same reference.
                        \\bibitem{%s} A separate reference.
                        \\end{thebibliography}
                        """.formatted(firstKey, secondKey))));
        when(sourceMatchingService.activeSources(projectId)).thenReturn(List.of(first, second));
        when(sourceMatchingService.referenceSources(paperId)).thenReturn(List.of());

        PaperReferenceCheckResponse result = service.check(paperId, leaderId);

        assertThat(result.items()).hasSize(2);
        assertThat(result.items().getFirst().rawText())
                .contains("First paragraph", "Second paragraph");
        assertThat(result.items()).extracting(PaperReferenceCheckResponse.Item::matchReason)
                .containsExactly(
                        PaperReferenceCheckResponse.MatchReason.CITATION_KEY,
                        PaperReferenceCheckResponse.MatchReason.CITATION_KEY);
    }

    @Test
    void checkDoesNotChooseAmbiguousTitleAndKeepsMissingEntryVisible() {
        Document first = source(ProcessingStatus.READY, "a.pdf");
        first.setTitle("Shared Long Research Paper Title");
        first.setPublicationYear(2024);
        Document second = source(ProcessingStatus.READY, "b.pdf");
        second.setTitle(first.getTitle());
        second.setPublicationYear(2024);

        when(paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(paperId))
                .thenReturn(List.of(referenceSection("""
                        Author. Shared Long Research Paper Title. 2024.

                        Author. A Completely Missing Research Work. 2023.
                        """)));
        when(sourceMatchingService.activeSources(projectId)).thenReturn(List.of(first, second));
        when(sourceMatchingService.referenceSources(paperId)).thenReturn(List.of());

        PaperReferenceCheckResponse result = service.check(paperId, leaderId);

        assertThat(result.items()).extracting(PaperReferenceCheckResponse.Item::status)
                .containsExactly(
                        PaperReferenceCheckResponse.Status.NEEDS_REVIEW,
                        PaperReferenceCheckResponse.Status.MISSING_SOURCE);
        assertThat(result.items().getFirst().matchedSourceId()).isNull();
        assertThat(result.summary().detected()).isEqualTo(2);
    }

    @Test
    void checkReturnsNoItemsWhenPaperHasNoReferenceSection() {
        when(paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(paperId))
                .thenReturn(List.of(section("Body text")));

        PaperReferenceCheckResponse result = service.check(paperId, leaderId);

        assertThat(result.referenceSectionFound()).isFalse();
        assertThat(result.summary().detected()).isZero();
        verify(sourceMatchingService, never()).activeSources(any());
    }

    @Test
    void checkPropagatesProjectAccessDenialWithoutReadingSources() {
        ResponseStatusException denied = new ResponseStatusException(HttpStatus.FORBIDDEN, "denied");
        doThrow(denied).when(currentUserService).requireProjectAccess(leader, project);

        assertThatThrownBy(() -> service.check(paperId, leaderId)).isSameAs(denied);

        verifyNoInteractions(sourceMatchingService);
    }

    @Test
    void addLinksVisibleSourceWithAvailabilityFlags() {
        Document source = source(ProcessingStatus.READY, "file.pdf");
        when(documentRepository.findById(source.getId())).thenReturn(Optional.of(source));
        when(paperReferenceRepository.findByPaperIdAndSourceId(paperId, source.getId()))
                .thenReturn(Optional.empty());
        when(paperReferenceRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        PaperReferenceResponse response = service.add(paperId, source.getId(), leaderId);

        assertThat(response.sourceId()).isEqualTo(source.getId());
        assertThat(response.citationKey()).isEqualTo(SourceMatchingService.citationKey(source.getId()));
        assertThat(response.fileAvailable()).isTrue();
        assertThat(response.retrievable()).isTrue();
        assertThat(response.addedBy()).isEqualTo(leaderId);
        verify(paperReferenceRepository).save(any());
    }

    @Test
    void addIsIdempotentForExistingLink() {
        Document source = source(ProcessingStatus.READY, "file.pdf");
        when(documentRepository.findById(source.getId())).thenReturn(Optional.of(source));
        PaperReference existing = link(source);
        when(paperReferenceRepository.findByPaperIdAndSourceId(paperId, source.getId()))
                .thenReturn(Optional.of(existing));

        assertThat(service.add(paperId, source.getId(), leaderId).sourceId()).isEqualTo(source.getId());
        verify(paperReferenceRepository, never()).save(any());
    }

    @Test
    void addRejectsOutsiderInactiveAndPaperDocuments() {
        Document outsider = source(ProcessingStatus.READY, "file.pdf");
        outsider.setProject(new Project());
        outsider.getProject().setId(UUID.randomUUID());
        when(documentRepository.findById(outsider.getId())).thenReturn(Optional.of(outsider));
        assertThatThrownBy(() -> service.add(paperId, outsider.getId(), leaderId))
                .isInstanceOf(ResourceNotFoundException.class);

        Document inactive = source(ProcessingStatus.READY, "file.pdf");
        inactive.setActive(false);
        when(documentRepository.findById(inactive.getId())).thenReturn(Optional.of(inactive));
        assertThatThrownBy(() -> service.add(paperId, inactive.getId(), leaderId))
                .isInstanceOf(ResourceNotFoundException.class);

        Document paperDoc = source(ProcessingStatus.READY, "file.pdf");
        paperDoc.setDocType(DocumentType.PAPER);
        when(documentRepository.findById(paperDoc.getId())).thenReturn(Optional.of(paperDoc));
        assertThatThrownBy(() -> service.add(paperId, paperDoc.getId(), leaderId))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void addAcceptsSharedSourceLinkedThroughProjectDocuments() {
        Document shared = source(ProcessingStatus.READY, "file.pdf");
        shared.setProject(null);
        when(documentRepository.findById(shared.getId())).thenReturn(Optional.of(shared));
        when(projectDocumentRepository.findByProjectIdAndDocumentId(projectId, shared.getId()))
                .thenReturn(Optional.of(new com.evidencepilot.model.ProjectDocument()));
        when(paperReferenceRepository.findByPaperIdAndSourceId(paperId, shared.getId()))
                .thenReturn(Optional.empty());
        when(paperReferenceRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        assertThat(service.add(paperId, shared.getId(), leaderId).sourceId()).isEqualTo(shared.getId());
    }

    @Test
    void addRejectsInstructorAndReadOnlyProject() {
        User instructor = new User();
        instructor.setId(UUID.randomUUID());
        instructor.setRole(UserRole.INSTRUCTOR);
        when(userRepository.findById(instructor.getId())).thenReturn(Optional.of(instructor));
        Document source = source(ProcessingStatus.READY, "file.pdf");
        when(documentRepository.findById(source.getId())).thenReturn(Optional.of(source));
        assertThatThrownBy(() -> service.add(paperId, source.getId(), instructor.getId()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("403");

        project.setStatus(ProjectStatus.APPROVED);
        assertThatThrownBy(() -> service.add(paperId, source.getId(), leaderId))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("409");
    }

    @Test
    void metadataOnlySourceIsVisibleButNotRetrievable() {
        Document source = source(ProcessingStatus.METADATA_FETCHED, "pending");
        PaperReference existing = link(source);
        when(documentRepository.findById(source.getId())).thenReturn(Optional.of(source));
        when(paperReferenceRepository.findByPaperIdAndSourceId(paperId, source.getId()))
                .thenReturn(Optional.of(existing));
        when(sourceMatchingService.referenceSources(paperId)).thenReturn(List.of(source));
        when(sourceMatchingService.retrievableReferenceSources(paperId)).thenReturn(List.of());
        PaperReferenceResponse response = service.add(paperId, source.getId(), leaderId);

        assertThat(response.fileAvailable()).isFalse();
        assertThat(response.retrievable()).isFalse();
        assertThat(service.retrievableReferenceSources(paperId)).isEmpty();
        assertThat(service.referenceSources(paperId)).extracting(Document::getId)
                .containsExactly(source.getId());
    }

    @Test
    void removeDeletesUncitedReference() {
        Document source = source(ProcessingStatus.READY, "file.pdf");
        PaperReference reference = link(source);
        when(paperReferenceRepository.findByPaperIdAndSourceId(paperId, source.getId()))
                .thenReturn(Optional.of(reference));
        when(paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(paperId))
                .thenReturn(List.of(section("no citations here")));

        service.remove(paperId, source.getId(), leaderId);

        verify(paperReferenceRepository).delete(reference);
    }

    @Test
    void removeRejectsCitedReferenceWithInUseCode() {
        Document source = source(ProcessingStatus.READY, "file.pdf");
        when(paperReferenceRepository.findByPaperIdAndSourceId(paperId, source.getId()))
                .thenReturn(Optional.of(link(source)));
        when(paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(paperId))
                .thenReturn(List.of(section("see \\cite{" + SourceMatchingService.citationKey(source.getId()) + "}")));

        assertThatThrownBy(() -> service.remove(paperId, source.getId(), leaderId))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("REFERENCE_IN_USE");
        verify(paperReferenceRepository, never()).delete(any());
    }

    @Test
    void removeMissingLinkReturnsNotFound() {
        UUID sourceId = UUID.randomUUID();
        when(paperReferenceRepository.findByPaperIdAndSourceId(paperId, sourceId))
                .thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.remove(paperId, sourceId, leaderId))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void removeIgnoresProseBibitemAndCommentButRecognizesCiteLists() {
        Document source = source(ProcessingStatus.READY, "file.pdf");
        PaperReference reference = link(source);
        String key = SourceMatchingService.citationKey(source.getId());
        when(paperReferenceRepository.findByPaperIdAndSourceId(paperId, source.getId()))
                .thenReturn(Optional.of(reference));
        when(paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(paperId))
                .thenReturn(List.of(section(key + "\n\\bibitem{" + key + "} text\n% \\cite{" + key + "}")));
        service.remove(paperId, source.getId(), leaderId);
        verify(paperReferenceRepository).delete(reference);
        when(paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(paperId))
                .thenReturn(List.of(section("\\cite[p. 2]{manual, " + key.toUpperCase() + "}")));
        assertThatThrownBy(() -> service.remove(paperId, source.getId(), leaderId))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("REFERENCE_IN_USE");
    }

    @Test
    void sharedMetadataOnlySourceRequiresOwnerAttachmentAndRedactsError() {
        Document source = source(ProcessingStatus.METADATA_FETCHED, "pending");
        source.setProject(null);
        source.setProcessingError("token=private; C:\\private\\extract.log");
        when(documentRepository.findById(source.getId())).thenReturn(Optional.of(source));
        when(projectDocumentRepository.findByProjectIdAndDocumentId(projectId, source.getId()))
                .thenReturn(Optional.of(new com.evidencepilot.model.ProjectDocument()));
        when(paperReferenceRepository.findByPaperIdAndSourceId(paperId, source.getId()))
                .thenReturn(Optional.of(link(source)));
        PaperReferenceResponse response = service.add(paperId, source.getId(), leaderId);
        assertThat(response.canAttachFile()).isFalse();
        assertThat(response.processingError()).isEqualTo("SOURCE_PROCESSING_FAILED");
        source.setProject(project);
        assertThat(service.add(paperId, source.getId(), leaderId).canAttachFile()).isTrue();
    }

    private Document source(ProcessingStatus status, String fileUrl) {
        Document source = new Document();
        source.setId(UUID.randomUUID());
        source.setDocType(DocumentType.SOURCE);
        source.setActive(true);
        source.setProject(project);
        source.setProcessingStatus(status);
        source.setFileUrl(fileUrl);
        source.setTitle("Source");
        return source;
    }

    private PaperReference link(Document source) {
        PaperReference reference = new PaperReference();
        reference.setPaper(paper);
        reference.setSource(source);
        reference.setAddedBy(leader);
        return reference;
    }

    private PaperSection section(String tex) {
        PaperSection section = new PaperSection();
        section.setSectionTitle("Introduction");
        section.setActive(true);
        section.setContentTex(tex);
        return section;
    }

    private PaperSection referenceSection(String tex) {
        PaperSection section = section(tex);
        section.setSectionTitle("References");
        return section;
    }

    private ProjectMember member(ProjectRole role) {
        ProjectMember member = new ProjectMember();
        member.setProject(project);
        member.setUser(leader);
        member.setRole(role);
        return member;
    }
}
