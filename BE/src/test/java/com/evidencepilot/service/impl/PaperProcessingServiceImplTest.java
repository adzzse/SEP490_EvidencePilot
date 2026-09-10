package com.evidencepilot.service.impl;

import com.evidencepilot.dto.request.SectionBatchItem;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.DocumentText;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.SectionStandardEvaluation;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.ProcessingStatus;
import com.evidencepilot.model.enums.ProjectStatus;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.InstructorFeedbackRepository;
import com.evidencepilot.repository.PaperSectionRepository;
import com.evidencepilot.repository.ProjectRepository;
import com.evidencepilot.repository.SectionStandardEvaluationRepository;
import com.evidencepilot.repository.UserRepository;
import com.evidencepilot.service.AuditService;
import com.evidencepilot.service.CurrentUserService;
import com.evidencepilot.service.AiModelClient;
import com.evidencepilot.service.PaperStandardService;
import com.evidencepilot.service.FeedbackAnchorService;
import com.evidencepilot.service.SystemNotificationService;
import com.evidencepilot.service.TexArchiveBuilder;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PaperProcessingServiceImplTest {

    @Mock
    private DocumentRepository documentRepository;
    @Mock
    private PaperSectionRepository paperSectionRepository;
    @Mock
    private UserRepository userRepository;
    @Mock
    private ProjectRepository projectRepository;
    @Mock
    private CurrentUserService currentUserService;
    @Mock
    private AuditService auditService;
    @Mock
    private EvidenceTraceService evidenceTraceService;
    @Mock
    private SectionStandardEvaluationRepository sectionStandardEvaluationRepository;
    @Mock
    private FeedbackAnchorService feedbackAnchorService;

    @Test
    void detectsLatexSections() {
        UUID documentId = UUID.randomUUID();
        Document document = new Document();
        document.setId(documentId);
        DocumentText text = new DocumentText();
        text.setDocument(document);
        text.setExtractedText("""
                \\documentclass{article}
                \\begin{document}
                \\section{Introduction}
                First section.
                \\section*{Methods}
                Second section.
                \\end{document}
                """);
        document.setDocumentText(text);

        when(documentRepository.findById(documentId)).thenReturn(Optional.of(document));
        when(paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(documentId)).thenReturn(List.of());
        List<PaperSection> saved = new ArrayList<>();
        when(paperSectionRepository.saveAll(anyList())).thenAnswer(invocation -> {
            Iterable<PaperSection> sections = invocation.getArgument(0);
            sections.forEach(saved::add);
            return saved;
        });

        service().detectAndPersistSections(documentId);

        assertThat(saved).extracting(PaperSection::getSectionTitle)
                .containsExactly("Introduction", "Methods");
        assertThat(saved).extracting(PaperSection::getContentTex)
                .containsExactly("First section.", "Second section.\n\\end{document}");
    }

    @Test
    void usesExtractorHierarchyForTopLevelSections() {
        UUID documentId = UUID.randomUUID();
        Document document = new Document();
        document.setId(documentId);
        DocumentText text = new DocumentText();
        text.setDocument(document);
        text.setExtractedText("""
                # Evaluation of adipokines
                ## Abstract
                Abstract body.
                ## Introduction
                Introduction body.
                ## Material and methods Study design
                Study design body.
                ## Population
                Population body.
                ## Laboratory methods
                Laboratory body.
                ## Leptin and Vaspin Quantification: Enzymatic Method (Diasource, KAP2281)
                Assay body.
                ## Statistical analysis
                Statistics body.
                ## Results
                Results body.
                ## Adipokine level correlation analysis and principal component scores
                Correlation body.
                ## Discussion
                Discussion body.
                ## Study limitations
                Limitations body.
                ## Conclusions
                Conclusion body.
                ## Acknowledgments
                Thanks.
                ## References
                Reference 1.
                """);
        document.setDocumentText(text);
        List<AiModelClient.ExtractionBlock> blocks = List.of(
                heading("Evaluation of adipokines", 1),
                heading("Abstract", 2),
                para("Abstract body."),
                heading("Introduction", 2),
                para("Introduction body."),
                heading("Material and methods Study design", 2),
                para("Study design body."),
                heading("Population", 3),
                para("Population body."),
                heading("Laboratory methods", 3),
                para("Laboratory body."),
                heading("Leptin and Vaspin Quantification: Enzymatic Method (Diasource, KAP2281)", 3),
                para("Assay body."),
                heading("Statistical analysis", 3),
                para("Statistics body."),
                heading("Results", 2),
                para("Results body."),
                heading("Adipokine level correlation analysis and principal component scores", 3),
                para("Correlation body."),
                heading("Discussion", 2),
                para("Discussion body."),
                heading("Study limitations", 3),
                para("Limitations body."),
                heading("Conclusions", 2),
                para("Conclusion body."),
                heading("Acknowledgments", 2),
                para("Thanks."),
                new AiModelClient.ExtractionBlock("reference", "References", null, null),
                para("Reference 1."));

        when(documentRepository.findById(documentId)).thenReturn(Optional.of(document));
        when(paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(documentId)).thenReturn(List.of());
        List<PaperSection> saved = new ArrayList<>();
        when(paperSectionRepository.saveAll(anyList())).thenAnswer(invocation -> {
            Iterable<PaperSection> sections = invocation.getArgument(0);
            sections.forEach(saved::add);
            return saved;
        });

        service().detectAndPersistSections(documentId, blocks);

        assertThat(saved).extracting(PaperSection::getSectionTitle)
                .containsExactly(
                        "Paper Info",
                        "Abstract",
                        "Introduction",
                        "Material and methods Study design",
                        "Results",
                        "Discussion",
                        "Conclusions",
                        "Acknowledgments",
                        "References");
        assertThat(saved.getFirst().getContentTex())
                .isEqualTo("\\textbf{Title:} Evaluation of adipokines");
        // H3 blocks stay inside the general section as \textbf subheadings — never split.
        assertThat(saved).allMatch(section -> section.getParentSection() == null);
        assertThat(saved.get(3).getContentTex()).isEqualTo(
                "Study design body."
                + "\n\n\\textbf{Population}\n\nPopulation body."
                + "\n\n\\textbf{Laboratory methods}\n\nLaboratory body."
                + "\n\n\\textbf{Leptin and Vaspin Quantification: Enzymatic Method (Diasource, KAP2281)}\n\nAssay body."
                + "\n\n\\textbf{Statistical analysis}\n\nStatistics body.");
        assertThat(saved.get(4).getContentTex()).isEqualTo(
                "Results body."
                + "\n\n\\textbf{Adipokine level correlation analysis and principal component scores}\n\nCorrelation body.");
        assertThat(saved.get(5).getContentTex()).isEqualTo(
                "Discussion body.\n\n\\textbf{Study limitations}\n\nLimitations body.");
        assertThat(saved.get(8).getContentTex()).isEqualTo("Reference 1.");
        // Gap ordering: distinct, ascending, step-based.
        assertThat(saved).extracting(PaperSection::getSectionOrder)
                .containsExactly(1024, 2048, 3072, 4096, 5120, 6144, 7168, 8192, 9216);
    }

    @Test
    void promotesInlineAbstractAndPreservesNumberedSections() {
        UUID documentId = UUID.randomUUID();
        Document document = new Document();
        document.setId(documentId);
        DocumentText text = new DocumentText();
        text.setDocument(document);
        List<String> headings = List.of(
                "1. Introduction",
                "2. Background",
                "3. Research methodology",
                "4. Results",
                "5. Discussion",
                "6. Conclusion",
                "7. Acknowledgments",
                "8. References",
                "Appendix A",
                "Table A.17",
                "Appendix B",
                "Appendix C",
                "Appendix D");
        text.setExtractedText("""
                # Paper title
                Authors

                Abstract: Abstract body.

                Keywords: AI, ML

                """ + String.join(
                "\n",
                headings.stream().map(title -> "## " + title + "\nBody.").toList()));
        document.setDocumentText(text);

        List<AiModelClient.ExtractionBlock> blocks = new ArrayList<>();
        blocks.add(heading("Paper title", 1));
        blocks.add(para("Authors"));
        blocks.add(para("Abstract: Abstract body."));
        blocks.add(para("Keywords: AI, ML"));
        headings.forEach(title -> blocks.add(heading(title, 2)));
        when(documentRepository.findById(documentId)).thenReturn(Optional.of(document));
        when(paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(documentId)).thenReturn(List.of());
        List<PaperSection> saved = new ArrayList<>();
        when(paperSectionRepository.saveAll(anyList())).thenAnswer(invocation -> {
            Iterable<PaperSection> sections = invocation.getArgument(0);
            sections.forEach(saved::add);
            return saved;
        });

        service().detectAndPersistSections(documentId, blocks);

        assertThat(saved).extracting(PaperSection::getSectionTitle)
                .containsExactly(
                        "Paper Info",
                        "Abstract",
                        "1. Introduction",
                        "2. Background",
                        "3. Research methodology",
                        "4. Results",
                        "5. Discussion",
                        "6. Conclusion",
                        "7. Acknowledgments",
                        "8. References",
                        "Appendix A",
                        "Table A.17",
                        "Appendix B",
                        "Appendix C",
                        "Appendix D");
        assertThat(saved.getFirst().getContentTex()).isEqualTo(
                "\\textbf{Title:} Paper title"
                + "\n\n\\textbf{Authors:} Authors"
                + "\n\n\\textbf{Keywords:} AI, ML");
        assertThat(saved.get(1).getContentTex())
                .isEqualTo("Abstract body.\n\nKeywords: AI, ML");
    }

    private static AiModelClient.ExtractionBlock heading(String text, int level) {
        return new AiModelClient.ExtractionBlock("heading", text, level, null);
    }

    private static AiModelClient.ExtractionBlock para(String text) {
        return new AiModelClient.ExtractionBlock("paragraph", text, null, null);
    }

    @Test
    void spladePreambleGoesToMetadataAndKeywordsProduceNoSection() throws Exception {
        UUID documentId = UUID.randomUUID();
        Document document = new Document();
        document.setId(documentId);
        DocumentText text = new DocumentText();
        text.setDocument(document);
        text.setExtractedText("full text placeholder");
        document.setDocumentText(text);
        List<AiModelClient.ExtractionBlock> blocks = List.of(
                heading("SPLADE v2: Sparse Lexical and Expansion Model for Information Retrieval", 1),
                para("Thibault Formal\nNaver Labs Europe\nMeylan, France\nthibault.formal@naverlabs.com"),
                para("Carlos Lassance Naver Labs Europe Meylan, France carlos.lassance@naverlabs.com"),
                heading("ABSTRACT", 2),
                para("In neural Information Retrieval (IR), ongoing research continues."),
                heading("KEYWORDS", 2),
                para("neural networks, indexing, sparse representations, regularization"),
                heading("1 INTRODUCTION", 2),
                para("The release of large pre-trained language models shook the field."),
                heading("2 RELATED WORKS", 2),
                para("Dense retrieval based on BERT became standard."),
                heading("5 CONCLUSION", 2),
                para("In this paper, we have built on SPLADE."),
                new AiModelClient.ExtractionBlock("reference", "REFERENCES", null, null));

        com.evidencepilot.repository.DocumentMetadataRepository metadataRepo =
                mock(com.evidencepilot.repository.DocumentMetadataRepository.class);
        PaperProcessingServiceImpl svc = new PaperProcessingServiceImpl(
                paperSectionRepository,
                metadataRepo,
                new BlockTreeIngestor(new com.fasterxml.jackson.databind.ObjectMapper()),
                mock(InstructorFeedbackRepository.class),
                documentRepository,
                currentUserService,
                mock(PaperStandardService.class),
                userRepository,
                projectRepository,
                mock(SystemNotificationService.class),
                mock(TexArchiveBuilder.class),
                evidenceTraceService,
                auditService,
                sectionStandardEvaluationRepository,
                feedbackAnchorService,
                new com.fasterxml.jackson.databind.ObjectMapper());
        when(documentRepository.findById(documentId)).thenReturn(Optional.of(document));
        when(paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(documentId)).thenReturn(List.of());
        List<PaperSection> saved = new ArrayList<>();
        when(paperSectionRepository.saveAll(anyList())).thenAnswer(invocation -> {
            Iterable<PaperSection> sections = invocation.getArgument(0);
            sections.forEach(saved::add);
            return saved;
        });

        svc.detectAndPersistSections(documentId, blocks);

        // Every source heading is its own node, verbatim — nothing absorbed, nothing renamed.
        assertThat(saved).extracting(PaperSection::getSectionTitle)
                .containsExactly(
                        "Paper Info",
                        "ABSTRACT",
                        "1 INTRODUCTION",
                        "2 RELATED WORKS",
                        "5 CONCLUSION",
                        "References");
        assertThat(saved.getFirst().getContentTex()).isEqualTo(
                "\\textbf{Title:} SPLADE v2: Sparse Lexical and Expansion Model for Information Retrieval"
                + "\n\n\\textbf{Authors:} Thibault Formal; Carlos Lassance Naver Labs Europe Meylan, France"
                + "\n\n\\textbf{Affiliations:} Naver Labs Europe; Meylan, France"
                + "\n\n\\textbf{Emails:} thibault.formal@naverlabs.com; carlos.lassance@naverlabs.com"
                + "\n\n\\textbf{Keywords:} neural networks, indexing, sparse representations, regularization");
        assertThat(saved.get(1).getContentTex()).isEqualTo(
                "In neural Information Retrieval (IR), ongoing research continues."
                + "\n\nKeywords: neural networks, indexing, sparse representations, regularization");
        assertThat(saved.get(2).getContentTex())
                .isEqualTo("The release of large pre-trained language models shook the field.");
        assertThat(saved.stream().map(PaperSection::getContentTex).toList())
                .noneMatch(content -> content.contains("thibault.formal@naverlabs.com")
                        && !content.contains("\\textbf{Emails:}"));

        var metadataCaptor = org.mockito.ArgumentCaptor
                .forClass(com.evidencepilot.model.DocumentMetadata.class);
        verify(metadataRepo).save(metadataCaptor.capture());
        com.evidencepilot.model.DocumentMetadata metadata = metadataCaptor.getValue();
        assertThat(metadata.getTitle()).startsWith("SPLADE v2");
        assertThat(metadata.getKeywords()).contains("neural networks");
        var authors = new com.fasterxml.jackson.databind.ObjectMapper()
                .readTree(metadata.getAuthorsJson());
        assertThat(authors.size()).isEqualTo(2);
        assertThat(metadata.getAuthorsJson()).contains("thibault.formal@naverlabs.com",
                "carlos.lassance@naverlabs.com");
    }

    @Test
    void dottedSubsectionsCollapseAndReferencesMerge() {
        UUID documentId = UUID.randomUUID();
        Document document = new Document();
        document.setId(documentId);
        DocumentText text = new DocumentText();
        text.setDocument(document);
        text.setExtractedText("full text placeholder");
        document.setDocumentText(text);
        List<AiModelClient.ExtractionBlock> blocks = List.of(
                heading("SPLADE v2", 1),
                para("Thibault Formal\nthibault.formal@naverlabs.com"),
                heading("ABSTRACT", 2),
                para("Abstract body."),
                heading("3 SPARSE LEXICAL REPRESENTATIONS FOR FIRST-STAGE RANKING", 2),
                para("Section 3 body."),
                heading("3.1 SPLADE", 2),
                para("SPLADE body."),
                heading("3.2 Pooling strategy", 2),
                para("Pooling body."),
                heading("4 EXPERIMENTAL SETTING AND RESULTS", 2),
                para("Section 4 body."),
                heading("4.1 Impact of max pooling", 2),
                para("Pooling impact body."),
                new AiModelClient.ExtractionBlock("reference", "REFERENCES", null, null),
                new AiModelClient.ExtractionBlock("reference",
                        "- [1] Yang Bai et al. 2020. SparTerm.", null, null),
                new AiModelClient.ExtractionBlock("reference",
                        "- [2] Leonid Boytsov. 2018. k-NN Search.", null, null));

        when(documentRepository.findById(documentId)).thenReturn(Optional.of(document));
        when(paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(documentId)).thenReturn(List.of());
        List<PaperSection> saved = new ArrayList<>();
        when(paperSectionRepository.saveAll(anyList())).thenAnswer(invocation -> {
            Iterable<PaperSection> sections = invocation.getArgument(0);
            sections.forEach(saved::add);
            return saved;
        });

        service().detectAndPersistSections(documentId, blocks);

        assertThat(saved).extracting(PaperSection::getSectionTitle)
                .containsExactly(
                        "Paper Info",
                        "ABSTRACT",
                        "3 SPARSE LEXICAL REPRESENTATIONS FOR FIRST-STAGE RANKING",
                        "4 EXPERIMENTAL SETTING AND RESULTS",
                        "References");
        assertThat(saved.get(2).getContentTex()).isEqualTo(
                "Section 3 body."
                + "\n\n\\textbf{3.1 SPLADE}\n\nSPLADE body."
                + "\n\n\\textbf{3.2 Pooling strategy}\n\nPooling body.");
        assertThat(saved.get(3).getContentTex()).isEqualTo(
                "Section 4 body.\n\n\\textbf{4.1 Impact of max pooling}\n\nPooling impact body.");
        assertThat(saved.get(4).getContentTex())
                .contains("- [1] Yang Bai", "- [2] Leonid Boytsov");
    }

    @Test
    void paperInfoSectionIncludesDoiWhenKnown() {
        UUID documentId = UUID.randomUUID();
        Document document = new Document();
        document.setId(documentId);
        document.setDoi("10.1234/splade");
        DocumentText text = new DocumentText();
        text.setDocument(document);
        text.setExtractedText("full text placeholder");
        document.setDocumentText(text);
        List<AiModelClient.ExtractionBlock> blocks = List.of(
                heading("Some Title", 1),
                heading("ABSTRACT", 2),
                para("Body."));

        when(documentRepository.findById(documentId)).thenReturn(Optional.of(document));
        when(paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(documentId)).thenReturn(List.of());
        List<PaperSection> saved = new ArrayList<>();
        when(paperSectionRepository.saveAll(anyList())).thenAnswer(invocation -> {
            Iterable<PaperSection> sections = invocation.getArgument(0);
            sections.forEach(saved::add);
            return saved;
        });

        service().detectAndPersistSections(documentId, blocks);

        assertThat(saved).extracting(PaperSection::getSectionTitle)
                .containsExactly("Paper Info", "ABSTRACT");
        assertThat(saved.getFirst().getContentTex()).contains("\\textbf{DOI:} 10.1234/splade");
    }

    @Test
    void getPaperMetadataPrefersExtractorValuesAndFallsBackToDocument() {
        com.evidencepilot.repository.DocumentMetadataRepository metadataRepo =
                mock(com.evidencepilot.repository.DocumentMetadataRepository.class);
        PaperProcessingServiceImpl svc = new PaperProcessingServiceImpl(
                paperSectionRepository,
                metadataRepo,
                new BlockTreeIngestor(new com.fasterxml.jackson.databind.ObjectMapper()),
                mock(InstructorFeedbackRepository.class),
                documentRepository,
                currentUserService,
                mock(PaperStandardService.class),
                userRepository,
                projectRepository,
                mock(SystemNotificationService.class),
                mock(TexArchiveBuilder.class),
                evidenceTraceService,
                auditService,
                sectionStandardEvaluationRepository,
                feedbackAnchorService,
                new com.fasterxml.jackson.databind.ObjectMapper());

        Project project = project(ProjectStatus.IN_PROGRESS);
        Document paperDoc = paper(project);
        paperDoc.setTitle("Doc title");
        paperDoc.setAuthors("D. Ocument");
        paperDoc.setDoi("10.1234/abc");
        paperDoc.setPublisher("ACM");
        paperDoc.setPublicationYear(2021);
        com.evidencepilot.model.DocumentMetadata meta = new com.evidencepilot.model.DocumentMetadata();
        meta.setTitle("Extracted title");
        meta.setAuthorsJson("[{\"name\":\"A. Uthor\",\"affiliations\":[\"Lab\"],\"emails\":[\"a@x.com\"]}]");
        meta.setKeywords("k1, k2");
        when(metadataRepo.findByDocumentId(paperDoc.getId())).thenReturn(Optional.of(meta));
        when(currentUserService.requireCurrentUser()).thenReturn(user(UserRole.INSTRUCTOR));
        when(documentRepository.findById(paperDoc.getId())).thenReturn(Optional.of(paperDoc));

        var response = svc.getPaperMetadata(paperDoc.getId());

        assertThat(response.title()).isEqualTo("Extracted title");
        assertThat(response.authors()).singleElement().satisfies(author -> {
            assertThat(author.name()).isEqualTo("A. Uthor");
            assertThat(author.affiliations()).containsExactly("Lab");
            assertThat(author.emails()).containsExactly("a@x.com");
        });
        assertThat(response.keywords()).isEqualTo("k1, k2");
        assertThat(response.doi()).isEqualTo("10.1234/abc");
        assertThat(response.publisher()).isEqualTo("ACM");
        assertThat(response.publicationYear()).isEqualTo(2021);

        when(metadataRepo.findByDocumentId(paperDoc.getId())).thenReturn(Optional.empty());
        var fallback = svc.getPaperMetadata(paperDoc.getId());
        assertThat(fallback.title()).isEqualTo("Doc title");
        assertThat(fallback.authors()).singleElement()
                .satisfies(author -> assertThat(author.name()).isEqualTo("D. Ocument"));
        assertThat(fallback.keywords()).isNull();
    }

    @Test
    void validateSectionsIgnoresLegacyKeywordsNode() {
        PaperStandardService standards = mock(PaperStandardService.class);
        when(standards.getRequiredSections(
                com.evidencepilot.model.enums.PaperStandard.IEEE))
                .thenReturn(List.of("Abstract", "Introduction"));
        when(standards.normalizeSectionTitle(org.mockito.ArgumentMatchers.any()))
                .thenAnswer(invocation -> invocation.getArgument(0));
        com.evidencepilot.repository.DocumentMetadataRepository metadataRepo =
                mock(com.evidencepilot.repository.DocumentMetadataRepository.class);
        PaperProcessingServiceImpl svc = new PaperProcessingServiceImpl(
                paperSectionRepository,
                metadataRepo,
                new BlockTreeIngestor(new com.fasterxml.jackson.databind.ObjectMapper()),
                mock(InstructorFeedbackRepository.class),
                documentRepository,
                currentUserService,
                standards,
                userRepository,
                projectRepository,
                mock(SystemNotificationService.class),
                mock(TexArchiveBuilder.class),
                evidenceTraceService,
                auditService,
                sectionStandardEvaluationRepository,
                feedbackAnchorService,
                new com.fasterxml.jackson.databind.ObjectMapper());

        Project project = project(ProjectStatus.IN_PROGRESS);
        project.setTargetStandard(com.evidencepilot.model.enums.PaperStandard.IEEE);
        Document paperDoc = paper(project);
        PaperSection abstractSection = section(paperDoc);
        abstractSection.setSectionTitle("Abstract");
        PaperSection legacyKeywords = section(paperDoc);
        legacyKeywords.setSectionTitle("Keywords");
        when(currentUserService.requireCurrentUser()).thenReturn(user(UserRole.INSTRUCTOR));
        when(documentRepository.findById(paperDoc.getId())).thenReturn(Optional.of(paperDoc));
        when(paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(paperDoc.getId()))
                .thenReturn(List.of(abstractSection, legacyKeywords));

        var response = svc.validateSections(paperDoc.getId());

        assertThat(response.extraSections()).isEmpty();
        assertThat(response.missingSections()).containsExactly("Introduction");
    }

    @Test
    void batchUpdateAcceptsGapOrdering() {
        User instructor = user(UserRole.INSTRUCTOR);
        Project project = project(ProjectStatus.IN_PROGRESS);
        Document paperDoc = paper(project);
        PaperSection first = section(paperDoc);
        first.setSectionOrder(1024);
        first.setContentTex("A");
        PaperSection second = section(paperDoc);
        second.setSectionOrder(2048);
        second.setContentTex("B");
        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(currentUserService.isInstructor(instructor)).thenReturn(true);
        when(documentRepository.findById(paperDoc.getId())).thenReturn(Optional.of(paperDoc));
        when(paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(paperDoc.getId()))
                .thenReturn(List.of(first, second));

        var result = service().batchUpdateSections(paperDoc.getId(), List.of(
                new SectionBatchItem(first.getId(), 2048, "Intro", null, "A", 0L),
                new SectionBatchItem(second.getId(), 1024, "Intro", null, "B", 0L)));

        assertThat(result).hasSize(2);
        assertThat(first.getSectionOrder()).isEqualTo(2048);
        assertThat(second.getSectionOrder()).isEqualTo(1024);
        verify(paperSectionRepository).saveAll(anyList());
    }

    @Test
    void createSectionUsesGapStep() {
        User instructor = user(UserRole.INSTRUCTOR);
        Project project = project(ProjectStatus.IN_PROGRESS);
        Document paperDoc = paper(project);
        PaperSection existingSection = section(paperDoc);
        existingSection.setSectionOrder(1024);
        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(currentUserService.isInstructor(instructor)).thenReturn(true);
        when(documentRepository.findById(paperDoc.getId())).thenReturn(Optional.of(paperDoc));
        when(paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(paperDoc.getId()))
                .thenReturn(List.of(existingSection));
        when(paperSectionRepository.save(org.mockito.ArgumentMatchers.any()))
                .thenAnswer(invocation -> invocation.getArgument(0));

        var response = service().createSection(paperDoc.getId(), "Extra", null);

        assertThat(response.sectionOrder()).isEqualTo(2048);
    }

    @Test
    void leavesExistingSectionsUntouchedWhenStructuredBlocksAreProvided() {
        UUID documentId = UUID.randomUUID();
        Document document = new Document();
        document.setId(documentId);
        PaperSection existing = new PaperSection();
        existing.setDocument(document);
        existing.setSectionTitle("Abstract");

        when(documentRepository.findById(documentId)).thenReturn(Optional.of(document));
        when(paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(documentId))
                .thenReturn(List.of(existing));

        service().detectAndPersistSections(documentId, List.of(heading("Abstract", 2)));

        verify(paperSectionRepository, never()).saveAll(anyList());
    }

    @Test
    void assignSectionMovesCreatedProjectToAssigned() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(ProjectStatus.CREATED);
        Document paper = paper(project);
        PaperSection section = section(paper);
        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(currentUserService.isInstructor(instructor)).thenReturn(true);
        when(documentRepository.findById(paper.getId())).thenReturn(Optional.of(paper));
        when(userRepository.findById(student.getId())).thenReturn(Optional.of(student));
        when(paperSectionRepository.findById(section.getId())).thenReturn(Optional.of(section));
        when(paperSectionRepository.save(section)).thenReturn(section);

        service().assignSection(paper.getId(), section.getId(), student.getId());

        assertThat(section.getAssignedUser()).isEqualTo(student);
        assertThat(project.getStatus()).isEqualTo(ProjectStatus.ASSIGNED);
        verify(projectRepository).save(project);
    }

    @Test
    void assignSectionKeepsProjectStatusWhenAlreadyAssigned() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(ProjectStatus.ASSIGNED);
        Document paper = paper(project);
        PaperSection section = section(paper);
        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(currentUserService.isInstructor(instructor)).thenReturn(true);
        when(documentRepository.findById(paper.getId())).thenReturn(Optional.of(paper));
        when(userRepository.findById(student.getId())).thenReturn(Optional.of(student));
        when(paperSectionRepository.findById(section.getId())).thenReturn(Optional.of(section));
        when(paperSectionRepository.save(section)).thenReturn(section);

        service().assignSection(paper.getId(), section.getId(), student.getId());

        assertThat(project.getStatus()).isEqualTo(ProjectStatus.ASSIGNED);
        verify(projectRepository, never()).save(project);
    }

    @Test
    void assignedStudentSavingContentMovesAssignedProjectToInProgress() {
        User student = user(UserRole.STUDENT);
        Project project = project(ProjectStatus.ASSIGNED);
        Document paper = paper(project);
        PaperSection section = section(paper);
        section.setAssignedUser(student);
        when(currentUserService.requireCurrentUser()).thenReturn(student);
        when(documentRepository.findById(paper.getId())).thenReturn(Optional.of(paper));
        when(paperSectionRepository.findById(section.getId())).thenReturn(Optional.of(section));
        when(paperSectionRepository.save(section)).thenReturn(section);

        service().updateSection(
                paper.getId(), section.getId(), null, null, null, "draft text", 0L);

        assertThat(section.getContentTex()).isEqualTo("draft text");
        assertThat(project.getStatus()).isEqualTo(ProjectStatus.IN_PROGRESS);
        verify(projectRepository).save(project);
    }

    @Test
    void contentSaveRecordsWordDeltaAsEvidence() {
        User student = user(UserRole.STUDENT);
        Project project = project(ProjectStatus.IN_PROGRESS);
        Document paper = paper(project);
        PaperSection section = section(paper);
        section.setAssignedUser(student);
        section.setContentTex("old words");
        section.setVersion(2);
        when(currentUserService.requireCurrentUser()).thenReturn(student);
        when(documentRepository.findById(paper.getId())).thenReturn(Optional.of(paper));
        when(paperSectionRepository.findById(section.getId())).thenReturn(Optional.of(section));
        when(paperSectionRepository.save(section)).thenReturn(section);

        service().updateSection(
                paper.getId(), section.getId(), null, null, null,
                "new words plus one", 0L);

        assertThat(section.getPreviousContentTex()).isEqualTo("old words");
        verify(feedbackAnchorService).contentChanged(section, "old words", "new words plus one", 2, 3, null);
        assertThat(section.getVersion()).isEqualTo(3);
        verify(auditService).record(
                "SECTION_CONTENT_UPDATED",
                "PaperSection",
                section.getId(),
                student,
                null,
                Map.of(
                        "sectionId", section.getId(),
                        "sectionTitle", "Intro",
                        "projectId", project.getId(),
                        "beforeWordCount", 2,
                        "afterWordCount", 4,
                        "wordDelta", 2,
                        "wordsAdded", 3,
                        "wordsRemoved", 1,
                        "contentFingerprint", "ecddccec1117cff2670a3d2cc239b00adec76558d46ee8f5cb78ae82c6f81c57"));
    }

    @Test
    void rollbackRecordsWordDeltaAsEvidence() {
        User student = user(UserRole.STUDENT);
        Project project = project(ProjectStatus.IN_PROGRESS);
        Document paper = paper(project);
        PaperSection section = section(paper);
        section.setAssignedUser(student);
        section.setContentTex("current words");
        section.setPreviousContentTex("previous");
        section.setVersion(2);
        when(currentUserService.requireCurrentUser()).thenReturn(student);
        when(documentRepository.findById(paper.getId())).thenReturn(Optional.of(paper));
        when(paperSectionRepository.findById(section.getId())).thenReturn(Optional.of(section));
        when(paperSectionRepository.save(section)).thenReturn(section);

        service().rollbackSection(paper.getId(), section.getId(), 0L);

        assertThat(section.getContentTex()).isEqualTo("previous");
        assertThat(section.getPreviousContentTex()).isEqualTo("current words");
        verify(feedbackAnchorService).contentChanged(section, "current words", "previous", 2, 3, null);
        assertThat(section.getVersion()).isEqualTo(3);
        verify(evidenceTraceService).stampStaleOnContentChanged(
                section.getId(), "previous", 3);
        verify(auditService).record(
                "SECTION_CONTENT_UPDATED",
                "PaperSection",
                section.getId(),
                student,
                null,
                Map.of(
                        "sectionId", section.getId(),
                        "sectionTitle", "Intro",
                        "projectId", project.getId(),
                        "beforeWordCount", 2,
                        "afterWordCount", 1,
                        "wordDelta", -1,
                        "wordsAdded", 1,
                        "wordsRemoved", 2,
                        "contentFingerprint", "6da0633528deaa0144e7b058315f0b753ec0b945163a72bf96a0d18180f9de0d"));
    }

    @Test
    void rollbackRejectsAnIdenticalPreviousSave() {
        User student = user(UserRole.STUDENT);
        Project project = project(ProjectStatus.IN_PROGRESS);
        Document paper = paper(project);
        PaperSection section = section(paper);
        section.setAssignedUser(student);
        section.setContentTex("same content");
        section.setPreviousContentTex("same content");
        when(currentUserService.requireCurrentUser()).thenReturn(student);
        when(documentRepository.findById(paper.getId())).thenReturn(Optional.of(paper));
        when(paperSectionRepository.findById(section.getId())).thenReturn(Optional.of(section));

        assertThatThrownBy(() -> service().rollbackSection(
                paper.getId(), section.getId(), 0L))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(exception -> assertThat(
                        ((ResponseStatusException) exception).getStatusCode())
                        .isEqualTo(HttpStatus.CONFLICT));

        verify(paperSectionRepository, never()).save(section);
    }

    @Test
    void unchangedContentPreservesThePreviousSaveAndVersion() {
        User student = user(UserRole.STUDENT);
        Project project = project(ProjectStatus.IN_PROGRESS);
        Document paper = paper(project);
        PaperSection section = section(paper);
        section.setAssignedUser(student);
        section.setContentTex("same content");
        section.setPreviousContentTex("previous content");
        section.setVersion(7);
        when(currentUserService.requireCurrentUser()).thenReturn(student);
        when(documentRepository.findById(paper.getId())).thenReturn(Optional.of(paper));
        when(paperSectionRepository.findById(section.getId())).thenReturn(Optional.of(section));

        service().updateSection(
                paper.getId(), section.getId(), null, null, null, "same content", 0L);

        assertThat(section.getPreviousContentTex()).isEqualTo("previous content");
        assertThat(section.getVersion()).isEqualTo(7);
        verify(paperSectionRepository, never()).save(section);
        verifyNoInteractions(evidenceTraceService, auditService);
    }

    @Test
    void staleExpectedRevisionCannotOverwriteSectionContent() {
        User student = user(UserRole.STUDENT);
        Project project = project(ProjectStatus.IN_PROGRESS);
        Document paper = paper(project);
        PaperSection section = section(paper);
        section.setAssignedUser(student);
        section.setContentTex("server content");
        section.setOptVersion(4L);
        when(currentUserService.requireCurrentUser()).thenReturn(student);
        when(documentRepository.findById(paper.getId())).thenReturn(Optional.of(paper));
        when(paperSectionRepository.findById(section.getId())).thenReturn(Optional.of(section));

        assertThatThrownBy(() -> service().updateSection(
                paper.getId(), section.getId(), null, null, null, "stale edit", 3L))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(exception -> assertThat(
                        ((ResponseStatusException) exception).getStatusCode())
                        .isEqualTo(HttpStatus.CONFLICT));

        assertThat(section.getContentTex()).isEqualTo("server content");
        verify(paperSectionRepository, never()).save(section);
    }

    @Test
    void emptyUpdateDoesNotMoveAssignedProjectToInProgress() {
        User student = user(UserRole.STUDENT);
        Project project = project(ProjectStatus.ASSIGNED);
        Document paper = paper(project);
        PaperSection section = section(paper);
        section.setAssignedUser(student);
        when(currentUserService.requireCurrentUser()).thenReturn(student);
        when(documentRepository.findById(paper.getId())).thenReturn(Optional.of(paper));
        when(paperSectionRepository.findById(section.getId())).thenReturn(Optional.of(section));

        service().updateSection(
                paper.getId(), section.getId(), null, null, null, null, null);

        assertThat(project.getStatus()).isEqualTo(ProjectStatus.ASSIGNED);
        verify(projectRepository, never()).save(project);
    }

    @Test
    void instructorSavingContentDoesNotMoveAssignedProject() {
        User instructor = user(UserRole.INSTRUCTOR);
        Project project = project(ProjectStatus.ASSIGNED);
        Document paper = paper(project);
        PaperSection section = section(paper);
        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(documentRepository.findById(paper.getId())).thenReturn(Optional.of(paper));
        when(paperSectionRepository.findById(section.getId())).thenReturn(Optional.of(section));
        when(paperSectionRepository.save(section)).thenReturn(section);

        service().updateSection(
                paper.getId(), section.getId(), null, null, null, "instructor edit", 0L);

        assertThat(project.getStatus()).isEqualTo(ProjectStatus.ASSIGNED);
        verify(projectRepository, never()).save(project);
    }

    @Test
    void batchRejectsDuplicateSectionIdsBeforeMutatingRows() {
        User instructor = user(UserRole.INSTRUCTOR);
        Project project = project(ProjectStatus.IN_PROGRESS);
        Document paper = paper(project);
        PaperSection section = section(paper);
        section.setSectionOrder(0);
        section.setContentTex("Draft");
        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(documentRepository.findById(paper.getId())).thenReturn(Optional.of(paper));
        when(paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(paper.getId()))
                .thenReturn(List.of(section));
        List<SectionBatchItem> duplicated = List.of(
                new SectionBatchItem(section.getId(), 0, "Intro", null, "Draft", 0L),
                new SectionBatchItem(section.getId(), 1, "Intro", null, "Draft", 0L));

        assertThatThrownBy(() -> service().batchUpdateSections(paper.getId(), duplicated))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(((ResponseStatusException) error).getStatusCode())
                        .isEqualTo(HttpStatus.BAD_REQUEST))
                .hasMessageContaining("duplicate section id");

        verify(paperSectionRepository, never()).saveAll(anyList());
        verify(paperSectionRepository, never()).flush();
    }

    @Test
    void unchangedBatchDoesNotIncrementSectionRevision() {
        User instructor = user(UserRole.INSTRUCTOR);
        Project project = project(ProjectStatus.IN_PROGRESS);
        Document paper = paper(project);
        PaperSection section = section(paper);
        section.setSectionOrder(0);
        section.setContentTex("Draft");
        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(documentRepository.findById(paper.getId())).thenReturn(Optional.of(paper));
        when(paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(paper.getId()))
                .thenReturn(List.of(section));

        var result = service().batchUpdateSections(paper.getId(), List.of(
                new SectionBatchItem(section.getId(), 0, "Intro", null, "Draft", 0L)));

        assertThat(result).singleElement().extracting("revision").isEqualTo(0L);
        verify(paperSectionRepository, never()).saveAll(anyList());
        verify(paperSectionRepository, never()).flush();
        verifyNoInteractions(sectionStandardEvaluationRepository);
    }

    @Test
    void batchContentChangeMarksConfiguredStandardStale() {
        User student = user(UserRole.STUDENT);
        Project project = project(ProjectStatus.IN_PROGRESS);
        Document paper = paper(project);
        PaperSection section = section(paper);
        section.setSectionOrder(0);
        section.setContentTex("Before");
        section.setAssignedUser(student);
        SectionStandardEvaluation evaluation = new SectionStandardEvaluation();
        evaluation.setStatus(SectionStandardEvaluation.STATUS_PASSED);
        when(currentUserService.requireCurrentUser()).thenReturn(student);
        when(documentRepository.findById(paper.getId())).thenReturn(Optional.of(paper));
        when(paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(paper.getId()))
                .thenReturn(List.of(section));
        when(sectionStandardEvaluationRepository.findTopBySectionIdOrderByUpdatedAtDesc(section.getId()))
                .thenReturn(Optional.of(evaluation));

        service().batchUpdateSections(paper.getId(), List.of(
                new SectionBatchItem(section.getId(), 0, "Intro", student.getId(), "After", 0L)));

        assertThat(evaluation.getStatus()).isEqualTo(SectionStandardEvaluation.STATUS_STALE);
        verify(feedbackAnchorService).contentChanged(section, "Before", "After", 1, 2, null);
        verify(sectionStandardEvaluationRepository).save(evaluation);
        verify(paperSectionRepository).saveAll(anyList());
        verify(paperSectionRepository).flush();
    }

    @Test
    void batchCanUnassignAllAndRenameInOneAtomicRequest() {
        User instructor = user(UserRole.INSTRUCTOR);
        User student = user(UserRole.STUDENT);
        Project project = project(ProjectStatus.IN_PROGRESS);
        Document paper = paper(project);
        PaperSection section = section(paper);
        section.setSectionOrder(0);
        section.setContentTex("Draft");
        section.setAssignedUser(student);
        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(currentUserService.isInstructor(instructor)).thenReturn(true);
        when(documentRepository.findById(paper.getId())).thenReturn(Optional.of(paper));
        when(paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(paper.getId()))
                .thenReturn(List.of(section));

        var result = service().batchUpdateSections(paper.getId(), List.of(
                new SectionBatchItem(section.getId(), 0, "Renamed", null, "Draft", 0L)));

        assertThat(result).singleElement().satisfies(updated -> {
            assertThat(updated.sectionTitle()).isEqualTo("Renamed");
            assertThat(updated.assignedUserId()).isNull();
        });
        verify(paperSectionRepository).saveAll(anyList());
        verify(paperSectionRepository).flush();
    }

    private PaperProcessingServiceImpl service() {
        return new PaperProcessingServiceImpl(
                paperSectionRepository,
                mock(com.evidencepilot.repository.DocumentMetadataRepository.class),
                new BlockTreeIngestor(new com.fasterxml.jackson.databind.ObjectMapper()),
                mock(InstructorFeedbackRepository.class),
                documentRepository,
                currentUserService,
                mock(PaperStandardService.class),
                userRepository,
                projectRepository,
                mock(SystemNotificationService.class),
                mock(TexArchiveBuilder.class),
                evidenceTraceService,
                auditService,
                sectionStandardEvaluationRepository,
                feedbackAnchorService,
                new com.fasterxml.jackson.databind.ObjectMapper());
    }

    private User user(UserRole role) {
        User user = new User();
        user.setId(UUID.randomUUID());
        user.setRole(role);
        user.setEmail(user.getId() + "@example.com");
        return user;
    }

    private Project project(ProjectStatus status) {
        Project project = new Project();
        project.setId(UUID.randomUUID());
        project.setStatus(status);
        project.setActive(true);
        return project;
    }

    private Document paper(Project project) {
        Document document = new Document();
        document.setId(UUID.randomUUID());
        document.setProject(project);
        document.setProcessingStatus(ProcessingStatus.READY);
        return document;
    }

    private PaperSection section(Document paper) {
        PaperSection section = new PaperSection();
        section.setId(UUID.randomUUID());
        section.setDocument(paper);
        section.setSectionTitle("Intro");
        section.setOptVersion(0L);
        section.setActive(true);
        return section;
    }
}
