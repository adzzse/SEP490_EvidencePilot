package com.evidencepilot.service.impl;

import com.evidencepilot.dto.response.CitationValidationResponse;
import com.evidencepilot.dto.response.PaperValidationResponse;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.DocumentReference;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.PaperStandard;
import com.evidencepilot.model.enums.ProcessingStatus;
import com.evidencepilot.repository.DocumentReferenceRepository;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.PaperSectionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class CitationValidationServiceImplTest {

    private final DocumentRepository documentRepository = mock(DocumentRepository.class);
    private final DocumentReferenceRepository documentReferenceRepository = mock(DocumentReferenceRepository.class);
    private final PaperSectionRepository paperSectionRepository = mock(PaperSectionRepository.class);
    private final PaperProcessingServiceImpl paperProcessingService = mock(PaperProcessingServiceImpl.class);
    private final CurrentUserServiceImpl currentUserService = mock(CurrentUserServiceImpl.class);
    private final SourceMatchingService sourceMatchingService = mock(SourceMatchingService.class);

    private CitationValidationServiceImpl service;
    private Project project;
    private Document paper;
    private UUID projectId;
    private UUID paperId;

    @BeforeEach
    void setUp() {
        service = new CitationValidationServiceImpl(documentRepository, documentReferenceRepository,
                paperSectionRepository, paperProcessingService, currentUserService, sourceMatchingService);
        projectId = UUID.randomUUID();
        paperId = UUID.randomUUID();
        project = new Project();
        project.setId(projectId);
        paper = new Document();
        paper.setId(paperId);
        paper.setDocType(DocumentType.PAPER);
        paper.setActive(true);
        paper.setProject(project);
        paper.setOriginalFilename("paper.tex");
        when(documentRepository.findById(paperId)).thenReturn(Optional.of(paper));
        when(currentUserService.requireCurrentUser()).thenReturn(new User());
        when(paperProcessingService.validateSections(paperId)).thenReturn(
                new PaperValidationResponse(true, List.of(), List.of(), List.of(), PaperStandard.CUSTOM));
    }

    @Test
    void registeredReadyKeyPasses() {
        Document source = source(ProcessingStatus.READY);
        String key = SourceMatchingService.citationKey(source.getId());
        when(sourceMatchingService.referenceSources(paperId)).thenReturn(List.of(source));
        when(sourceMatchingService.retrievableReferenceSources(paperId)).thenReturn(List.of(source));
        when(paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(paperId))
                .thenReturn(List.of(section("See \\cite{" + key + "}.")));

        CitationValidationResponse response = service.validateCitations(paperId);

        assertThat(response.valid()).isTrue();
        assertThat(response.matchedCitations()).isEqualTo(1);
        assertThat(response.unavailableReferences()).isEmpty();
    }

    @Test
    void metadataOnlyKeyIsUnavailable() {
        Document source = source(ProcessingStatus.PROCESSING);
        String key = SourceMatchingService.citationKey(source.getId());
        when(sourceMatchingService.referenceSources(paperId)).thenReturn(List.of(source));
        when(sourceMatchingService.retrievableReferenceSources(paperId)).thenReturn(List.of());
        when(paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(paperId))
                .thenReturn(List.of(section("See \\cite{" + key + "}.")));

        CitationValidationResponse response = service.validateCitations(paperId);

        assertThat(response.valid()).isFalse();
        assertThat(response.unavailableReferences()).containsExactly(key);
        assertThat(response.matchedCitations()).isZero();
        assertThat(response.missingCitations()).isEmpty();
        assertThat(response.unmatchedKeys()).isEmpty();
    }

    @Test
    void unregisteredKeyIsMissingAndUnmatched() {
        String key = SourceMatchingService.citationKey(UUID.randomUUID());
        when(sourceMatchingService.referenceSources(paperId)).thenReturn(List.of());
        when(sourceMatchingService.retrievableReferenceSources(paperId)).thenReturn(List.of());
        when(paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(paperId))
                .thenReturn(List.of(section("See \\cite{" + key + "}.")));

        CitationValidationResponse response = service.validateCitations(paperId);

        assertThat(response.valid()).isFalse();
        assertThat(response.missingCitations()).containsExactly(key);
        assertThat(response.unmatchedKeys()).containsExactly(key);
        assertThat(response.unavailableReferences()).isEmpty();
    }

    @Test
    void manualBibliographyRemainsSupported() {
        DocumentReference reference = new DocumentReference();
        reference.setTitle("Manual reference work");
        when(documentReferenceRepository
                .findByDocumentProjectIdAndDocumentDocTypeAndDocumentActiveTrueOrderByDocumentIdAscReferenceIndexAsc(
                        projectId, DocumentType.SOURCE)).thenReturn(List.of(reference));
        when(paperProcessingService.validateSections(paperId)).thenReturn(
                new PaperValidationResponse(true, List.of(), List.of(), List.of(), PaperStandard.IEEE));
        when(paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(paperId)).thenReturn(List.of(
                section("See \\cite{manual}."),
                section("\\bibitem{manual} Manual reference work\n\\bibliography{refs}")));

        CitationValidationResponse response = service.validateCitations(paperId);

        assertThat(response.unmatchedKeys()).isEmpty();
        assertThat(response.unavailableReferences()).isEmpty();
    }

    private Document source(ProcessingStatus status) {
        Document source = new Document();
        source.setId(UUID.randomUUID());
        source.setDocType(DocumentType.SOURCE);
        source.setActive(true);
        source.setProject(project);
        source.setProcessingStatus(status);
        source.setFileUrl("file.pdf");
        return source;
    }

    private PaperSection section(String tex) {
        PaperSection section = new PaperSection();
        section.setContentTex(tex);
        section.setSectionTitle("Introduction");
        return section;
    }
}
