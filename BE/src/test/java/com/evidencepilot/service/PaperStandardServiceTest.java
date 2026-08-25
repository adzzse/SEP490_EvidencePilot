package com.evidencepilot.service;

import com.evidencepilot.model.enums.PaperStandard;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class PaperStandardServiceTest {

    private final AiModelClient aiModelClient = mock(AiModelClient.class);
    private final PaperStandardService service = new PaperStandardService(
            aiModelClient, new ObjectMapper());

    @BeforeEach
    void classifierDefaultsToCustom() {
        when(aiModelClient.generate(anyString(), anyString())).thenReturn(
                new AiModelClient.GenerationResult("test", "classifier", """
                        {"standard":"CUSTOM","confidencePercent":0,"evidence":[]}
                        """));
    }

    @Test
    void everyPaperStandardHasAResolvableTexTemplate() {
        for (PaperStandard standard : PaperStandard.values()) {
            String rendered = service.renderTemplate(
                    standard, "Project", "\\input{sections/01-introduction.tex}");
            assertThat(rendered)
                    .doesNotContain("{{TITLE}}", "{{BODY}}")
                    .contains("\\newcommand{\\epclaim}[2]{#2}")
                    .contains("\\input{sections/01-introduction.tex}");
        }
    }

    @Test
    void templateCommentsDoNotCountAsStudentContent() {
        String guidance = service.getSectionTemplate(
                PaperStandard.IEEE, "Introduction");
        assertThat(service.hasStudentContent(guidance)).isFalse();
        assertThat(service.hasStudentContent(guidance + "\nActual paper text.")).isTrue();
    }

    @Test
    void recognizableFormatMarkersRemainTheFastPath() {
        assertThat(service.suggestStandard("paper.tex", "\\documentclass{IEEEtran}"))
                .extracting("suggestedStandard", "confidencePercent")
                .containsExactly(PaperStandard.IEEE, 99);
        assertThat(service.suggestStandard("paper.pdf", "ACM Reference Format: Author. 2026."))
                .extracting("suggestedStandard", "confidencePercent")
                .containsExactly(PaperStandard.ACM, 95);
        assertThat(service.suggestStandard("paper.pdf", "Lecture Notes in Computer Science"))
                .extracting("suggestedStandard", "confidencePercent")
                .containsExactly(PaperStandard.SPRINGER_LNCS, 95);
        assertThat(service.suggestStandard("apa-template.docx", "Generic content"))
                .extracting("suggestedStandard", "confidencePercent")
                .containsExactly(PaperStandard.APA, 85);
        assertThat(service.suggestStandard("paper.docx", "# Works Cited\nEntry"))
                .extracting("suggestedStandard", "confidencePercent")
                .containsExactly(PaperStandard.MLA, 75);
        verifyNoInteractions(aiModelClient);
    }

    @Test
    void genericAcademicSectionsRemainCustom() {
        assertThat(service.suggestStandard(
                "paper.pdf",
                "Abstract\nIntroduction\nMethodology\nResults\nDiscussion\nReferences"))
                .extracting("suggestedStandard", "confidencePercent", "evidence")
                .containsExactly(PaperStandard.CUSTOM, 0, List.of());
        assertThat(service.suggestStandard("springer-article.pdf", "Generic content"))
                .extracting("suggestedStandard", "confidencePercent")
                .containsExactly(PaperStandard.CUSTOM, 0);
    }

    @Test
    void classifierHandlesPapersWithoutExactMarkers() {
        when(aiModelClient.generate(anyString(), anyString())).thenReturn(
                new AiModelClient.GenerationResult("test", "classifier", """
                        {
                          "standard":"APA",
                          "confidencePercent":82,
                          "evidence":["author-date citations and a References list"]
                        }
                        """));

        assertThat(service.suggestStandard(
                "paper.pdf",
                "Prior work (Smith, 2024) supports the result.\nReferences\nSmith, J. (2024). Title."))
                .extracting("suggestedStandard", "confidencePercent", "evidence")
                .containsExactly(
                        PaperStandard.APA,
                        82,
                        List.of("AI classifier: author-date citations and a References list"));
    }
}
