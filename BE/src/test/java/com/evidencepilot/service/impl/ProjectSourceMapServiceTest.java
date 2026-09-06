package com.evidencepilot.service.impl;

import com.evidencepilot.exception.ResourceNotFoundException;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.DocumentReference;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.EdgeType;
import com.evidencepilot.model.enums.ProcessingStatus;
import com.evidencepilot.repository.DocumentReferenceRepository;
import com.evidencepilot.repository.ProjectRepository;
import com.evidencepilot.service.CurrentUserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ProjectSourceMapServiceTest {
    private final ProjectRepository projects = mock(ProjectRepository.class);
    private final CurrentUserService users = mock(CurrentUserService.class);
    private final SourceMatchingService sources = mock(SourceMatchingService.class);
    private final DocumentReferenceRepository references = mock(DocumentReferenceRepository.class);
    private final ProjectSourceMapService service = new ProjectSourceMapService(projects, users, sources, references);
    private final Project project = new Project();
    private final User user = new User();

    @BeforeEach
    void setUp() {
        project.setId(UUID.randomUUID());
        project.setTitle("Source map project");
        when(users.requireCurrentUser()).thenReturn(user);
        when(projects.findById(project.getId())).thenReturn(Optional.of(project));
    }

    @Test
    void joinsOnlyProjectSourcesAndDeduplicatesDirectedCitationsWithProvenance() {
        Document a = source("10.1000/a");
        Document b = source("10.1000/b");
        Document outside = source("10.1000/outside");
        DocumentReference ab = reference(a, " HTTPS://DOI.ORG/10.1000/B ", EdgeType.REFERENCES);
        DocumentReference ba = reference(b, "doi:10.1000/A", EdgeType.CITED_BY);
        DocumentReference reverse = reference(b, a.getDoi(), EdgeType.REFERENCES);
        when(sources.activeSources(project.getId())).thenReturn(List.of(a, b));
        when(references.findForDocuments(any())).thenReturn(List.of(ab, ba, reverse,
                reference(a, a.getDoi(), EdgeType.REFERENCES),
                reference(a, outside.getDoi(), EdgeType.REFERENCES),
                reference(outside, a.getDoi(), EdgeType.REFERENCES)));

        var result = service.getSourceMap(project.getId());

        assertThat(result.nodes()).hasSize(3);
        assertThat(result.edges()).filteredOn(edge -> edge.type().equals("PROJECT_SOURCE")).hasSize(2);
        assertThat(result.edges()).filteredOn(edge -> edge.type().equals("CITES")).hasSize(2);
        assertThat(result.edges()).anySatisfy(edge -> {
            assertThat(edge.sourceId()).isEqualTo("source:" + a.getId());
            assertThat(edge.targetId()).isEqualTo("source:" + b.getId());
            assertThat(edge.referenceIds()).containsExactly(ab.getId(), ba.getId());
        });
        assertThat(result.nodes()).noneMatch(node -> outside.getId().equals(node.documentId()));
        verify(references).findForDocuments(java.util.Set.of(a.getId(), b.getId()));
    }

    @Test
    void retainsSourcesWithoutFilesOrDoiAndDoesNotGuessAmbiguousCitationTargets() {
        Document a = source("10.1000/a");
        Document b = source("10.1000/b");
        Document duplicate = source("https://doi.org/10.1000/B");
        Document missing = source(null);
        missing.setTitle(null);
        missing.setOriginalFilename("Scanned paper.pdf");
        missing.setFileUrl("pending");
        missing.setProcessingStatus(ProcessingStatus.FAILED);
        when(sources.activeSources(project.getId())).thenReturn(List.of(a, b, duplicate, missing));
        when(references.findForDocuments(any())).thenReturn(List.of(
                reference(a, b.getDoi(), EdgeType.REFERENCES),
                reference(a, null, EdgeType.REFERENCES)));

        var result = service.getSourceMap(project.getId());

        assertThat(result.nodes()).hasSize(5);
        assertThat(result.edges()).hasSize(4).allMatch(edge -> edge.type().equals("PROJECT_SOURCE"));
        assertThat(result.limitations()).containsExactly("SAVED_METADATA_ONLY", "SOURCES_WITHOUT_DOI", "AMBIGUOUS_SOURCE_DOI");
        assertThat(result.nodes()).anySatisfy(node -> {
            assertThat(node.documentId()).isEqualTo(missing.getId());
            assertThat(node.title()).isEqualTo("Scanned paper.pdf");
            assertThat(node.fileAvailable()).isFalse();
            assertThat(node.processingStatus()).isEqualTo(ProcessingStatus.FAILED);
        });
    }

    @Test
    void includesSourcesBeyondFirstPageAndCitationsAfterTheCollectionLimit() {
        var documents = IntStream.range(0, 105).mapToObj(index -> source("10.1000/source" + index)).toList();
        var rows = new ArrayList<>(IntStream.range(0, 25)
                .mapToObj(index -> reference(documents.getFirst(), "10.1000/external" + index, EdgeType.REFERENCES)).toList());
        rows.add(reference(documents.getFirst(), documents.getLast().getDoi(), EdgeType.REFERENCES));
        when(sources.activeSources(project.getId())).thenReturn(documents);
        when(references.findForDocuments(any())).thenReturn(rows);

        var result = service.getSourceMap(project.getId());

        assertThat(result.nodes()).hasSize(106);
        assertThat(result.edges()).hasSize(106);
        assertThat(result.edges().getLast().targetId()).isEqualTo("source:" + documents.getLast().getId());
        verify(references, times(1)).findForDocuments(any());
    }

    @Test
    void emptyProjectStillHasItsNodeWithoutAnEmptyInQuery() {
        when(sources.activeSources(project.getId())).thenReturn(List.of());
        var result = service.getSourceMap(project.getId());
        assertThat(result.nodes()).hasSize(1);
        assertThat(result.edges()).isEmpty();
        verifyNoInteractions(references);
    }

    @Test
    void checksProjectAccessBeforeLoadingAnySources() {
        doThrow(new ResponseStatusException(HttpStatus.FORBIDDEN)).when(users).requireProjectAccess(user, project);
        assertThatThrownBy(() -> service.getSourceMap(project.getId())).isInstanceOf(ResponseStatusException.class);
        verifyNoInteractions(sources, references);
    }

    @Test
    void missingProjectDoesNotReadSources() {
        when(projects.findById(project.getId())).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.getSourceMap(project.getId())).isInstanceOf(ResourceNotFoundException.class);
        verifyNoInteractions(sources, references);
    }

    private Document source(String doi) {
        Document document = new Document();
        document.setId(UUID.randomUUID());
        document.setDoi(doi);
        document.setTitle("Source " + doi);
        document.setFileUrl("sources/" + document.getId() + ".pdf");
        document.setProcessingStatus(ProcessingStatus.READY);
        return document;
    }

    private DocumentReference reference(Document owner, String doi, EdgeType type) {
        DocumentReference reference = new DocumentReference();
        reference.setId(UUID.randomUUID());
        reference.setDocument(owner);
        reference.setDoi(doi);
        reference.setEdgeType(type);
        return reference;
    }
}
