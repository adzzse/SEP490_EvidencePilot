package com.evidencepilot.prompt;

import com.evidencepilot.service.impl.SectionCitationReviewService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class SectionSuggestionPromptTest {

    private static final String EVIDENCE_HEADING = "Retrieved evidence chunks (JSON):\n";
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    @Test
    void build_limitsLongPromptWithoutBreakingEvidenceJson() throws Exception {
        List<SectionCitationReviewService.RetrievedEvidence> evidence = new ArrayList<>();
        for (int index = 0; index < 12; index++) {
            evidence.add(new SectionCitationReviewService.RetrievedEvidence(
                    UUID.randomUUID(),
                    UUID.randomUUID(),
                    "source-" + index,
                    "Long source title ".repeat(30),
                    "Evidence quote " + "x".repeat(1_500)));
        }
        String studentText = "BEGINNING OF SECTION\n"
                + "Long academic paragraph. ".repeat(4_000)
                + "\nEND OF SECTION";

        String prompt = SectionSuggestionPrompt.build(
                "Introduction".repeat(100),
                List.of("Very long criterion ".repeat(500)),
                studentText,
                evidence);

        assertThat(prompt).hasSize(SectionSuggestionPrompt.MAX_PROMPT_CHARS);
        assertThat(prompt).contains("BEGINNING OF SECTION", "END OF SECTION", "middle omitted");
        JsonNode evidenceNode = evidenceJson(prompt);
        assertThat(evidenceNode.isArray()).isTrue();
        assertThat(evidenceNode.size()).isGreaterThan(0);
        for (JsonNode item : evidenceNode) {
            assertThat(item.isObject()).isTrue();
            assertThat(item.hasNonNull("sourceId")).isTrue();
            assertThat(item.hasNonNull("chunkId")).isTrue();
            assertThat(item.hasNonNull("title")).isTrue();
            assertThat(item.hasNonNull("text")).isTrue();
        }
    }

    @Test
    void build_keepsShortStudentTextIntact() {
        String studentText = "The research question is stated explicitly.";

        String prompt = SectionSuggestionPrompt.build(
                "Introduction",
                List.of("Is the research question stated?"),
                studentText,
                List.of());

        assertThat(prompt).contains("\n\nStudent text:\n" + studentText);
        assertThat(prompt).doesNotContain("middle omitted");
        assertThat(prompt.length()).isLessThan(SectionSuggestionPrompt.MAX_PROMPT_CHARS);
    }

    @Test
    void build_preservesFullStudentTextByReducingEvidenceFirst() throws Exception {
        List<SectionCitationReviewService.RetrievedEvidence> evidence = new ArrayList<>();
        for (int index = 0; index < 12; index++) {
            evidence.add(new SectionCitationReviewService.RetrievedEvidence(
                    UUID.randomUUID(),
                    UUID.randomUUID(),
                    "source-" + index,
                    "Source title",
                    "Evidence quote " + "x".repeat(1_200)));
        }
        String studentText = "BEGIN\n" + "Academic text. ".repeat(2_500) + "\nEND";

        String prompt = SectionSuggestionPrompt.build(
                "Introduction",
                List.of("Is the research question stated?"),
                studentText,
                evidence);

        assertThat(prompt).contains("\n\nStudent text:\n" + studentText);
        assertThat(prompt).doesNotContain("middle omitted");
        assertThat(prompt.length()).isLessThanOrEqualTo(SectionSuggestionPrompt.MAX_PROMPT_CHARS);
        assertThat(evidenceJson(prompt).size()).isBetween(1, evidence.size() - 1);
    }

    private static JsonNode evidenceJson(String prompt) throws Exception {
        int start = prompt.indexOf(EVIDENCE_HEADING) + EVIDENCE_HEADING.length();
        int end = prompt.indexOf("\n\nStudent text", start);
        return OBJECT_MAPPER.readTree(prompt.substring(start, end));
    }
}
