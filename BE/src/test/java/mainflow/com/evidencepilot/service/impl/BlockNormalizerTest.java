package com.evidencepilot.service.impl;

import com.evidencepilot.service.AiModelClient;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class BlockNormalizerTest {

    private static AiModelClient.ExtractionBlock heading(String text, int level) {
        return new AiModelClient.ExtractionBlock("heading", text, level, null);
    }

    private static AiModelClient.ExtractionBlock para(String text) {
        return new AiModelClient.ExtractionBlock("paragraph", text, null, null);
    }

    @Test
    void downgradesLongSentenceHeadingsToBoldParagraphs() {
        String longHeading = "Takeaway " + "word ".repeat(30).strip();
        List<AiModelClient.ExtractionBlock> result = BlockNormalizer.normalizeBlocks(
                List.of(heading(longHeading, 2)));

        assertThat(result).singleElement().satisfies(block -> {
            assertThat(block.type()).isEqualTo("paragraph");
            assertThat(block.level()).isNull();
            assertThat(block.text()).startsWith("\\textbf{").endsWith("}");
            assertThat(block.text()).doesNotContain("**");
            assertThat(block.valid()).isTrue();
        });
    }

    @Test
    void keepsTrailingDotNumberingForIngestorSubsection() {
        List<AiModelClient.ExtractionBlock> result = BlockNormalizer.normalizeBlocks(List.of(
                heading("5.2. Practices support to challenges", 2),
                heading("5. CONCLUSION", 2)));

        assertThat(result).extracting(AiModelClient.ExtractionBlock::type)
                .containsExactly("heading", "heading");
    }

    @Test
    void downgradesColonLabeledTakeawayKeepingLabelBold() {
        List<AiModelClient.ExtractionBlock> result = BlockNormalizer.normalizeBlocks(
                List.of(heading("Takeaway 2: models with distillation perform best on BEIR", 2)));

        assertThat(result).singleElement().satisfies(block -> {
            assertThat(block.type()).isEqualTo("paragraph");
            assertThat(block.text()).isEqualTo(
                    "\\textbf{Takeaway 2:} models with distillation perform best on BEIR");
        });
    }

    @Test
    void keepsNumberedAcademicAndSecondaryHeadings() {
        List<AiModelClient.ExtractionBlock> result = BlockNormalizer.normalizeBlocks(List.of(
                heading("ABSTRACT", 2),
                heading("1 INTRODUCTION", 2),
                heading("3.1 SPLADE", 2),
                heading("IV. EXPERIMENTS", 2),
                heading("Threats to Validity", 2),
                heading("KEYWORDS", 2),
                heading("Document Title", 1),
                new AiModelClient.ExtractionBlock("reference", "REFERENCES", null, null),
                para("body")));

        assertThat(result).extracting(AiModelClient.ExtractionBlock::type)
                .containsExactly("heading", "heading", "heading", "heading", "heading",
                        "heading", "heading", "reference", "paragraph");
        assertThat(result).extracting(AiModelClient.ExtractionBlock::text)
                .containsExactly("ABSTRACT", "1 INTRODUCTION", "3.1 SPLADE", "IV. EXPERIMENTS",
                        "Threats to Validity", "KEYWORDS", "Document Title", "REFERENCES", "body");
    }

    @Test
    void downgradesShortUnlistedGrayZoneHeadings() {
        List<AiModelClient.ExtractionBlock> result = BlockNormalizer.normalizeBlocks(
                List.of(heading("Key Insight", 2)));

        assertThat(result).singleElement().satisfies(block -> {
            assertThat(block.type()).isEqualTo("paragraph");
            assertThat(block.text()).isEqualTo("\\textbf{Key Insight}");
        });
    }

    @Test
    void passesThroughNullsAndParagraphs() {
        assertThat(BlockNormalizer.normalizeBlocks(null)).isEmpty();
        assertThat(BlockNormalizer.normalizeBlocks(List.of(para("x"))))
                .extracting(AiModelClient.ExtractionBlock::type)
                .containsExactly("paragraph");
    }
}
