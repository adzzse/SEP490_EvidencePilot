package com.evidencepilot.service;

import com.evidencepilot.model.Document;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.PaperStandard;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.PaperSectionRepository;
import com.evidencepilot.repository.ProjectRepository;
import com.evidencepilot.service.impl.SourceMatchingService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.zip.ZipFile;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TexArchiveBuilderTest {

    @Test
    void writesStandardTemplateAndGeneratedBibliography() throws Exception {
        ProjectRepository projects = mock(ProjectRepository.class);
        DocumentRepository documents = mock(DocumentRepository.class);
        PaperSectionRepository sections = mock(PaperSectionRepository.class);
        TexArchiveMediaWriter media = mock(TexArchiveMediaWriter.class);
        SourceMatchingService sourceMatchingService = mock(SourceMatchingService.class);
        TexArchiveBuilder builder = new TexArchiveBuilder(
                projects,
                documents,
                sections,
                new PaperStandardService(mock(AiModelClient.class), new ObjectMapper()),
                media,
                sourceMatchingService);
        UUID projectId = UUID.randomUUID();
        Document source = new Document();
        source.setId(UUID.randomUUID());
        source.setTitle("Evidence Source");
        source.setAuthors("A. Researcher");
        source.setPublicationYear(2026);
        source.setDocType(DocumentType.SOURCE);
        source.setActive(true);
        String citationKey = SourceMatchingService.citationKey(source.getId());
        Project project = new Project();
        project.setId(projectId);
        project.setTitle("AI_Project");
        project.setTargetStandard(PaperStandard.IEEE);
        Document paper = new Document();
        paper.setId(UUID.randomUUID());
        paper.setDocType(DocumentType.PAPER);
        paper.setActive(true);
        PaperSection section = new PaperSection();
        section.setId(UUID.randomUUID());
        section.setDocument(paper);
        section.setSectionTitle("Introduction");
        section.setSectionOrder(0);
        section.setContentTex("Some text with a citation \\cite{" + citationKey + "}.");
        section.setActive(true);
        when(projects.findById(projectId)).thenReturn(Optional.of(project));
        when(documents.findByProjectIdAndDocTypeAndActiveTrue(
                projectId, DocumentType.PAPER)).thenReturn(List.of(paper));
        when(sections.findByDocumentIdOrderBySectionOrderAsc(paper.getId()))
                .thenReturn(List.of(section));
        when(sourceMatchingService.activeSources(projectId)).thenReturn(List.of(source));
        var archive = Files.createTempFile("tex-builder-test-", ".zip");

        try {
            builder.write(projectId, archive);
            try (ZipFile zip = new ZipFile(archive.toFile(), StandardCharsets.UTF_8)) {
                String main = text(zip, "main.tex");
                assertThat(main)
                        .contains("\\documentclass[conference]{IEEEtran}")
                        .contains("\\title{AI\\_Project}")
                        .contains("\\input{sections/01-introduction.tex}");
                assertThat(text(zip, "sections/01-introduction.tex"))
                        .contains("\\cite{" + citationKey + "}");
                assertThat(text(zip, "references.tex"))
                        .contains("\\begin{thebibliography}{99}")
                        .contains("\\bibitem{" + citationKey + "}")
                        .contains("A. Researcher", "Evidence Source", "2026");
            }
            verify(media).writeProjectMedia(any(), any());
        } finally {
            Files.deleteIfExists(archive);
        }
    }

    private static String text(ZipFile zip, String entry) throws Exception {
        return new String(
                zip.getInputStream(zip.getEntry(entry)).readAllBytes(),
                StandardCharsets.UTF_8);
    }
}
