package com.evidencepilot.service.impl;

import com.evidencepilot.service.AiModelClient;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class DocumentChunkerTest {

    @Test
    void groupsAtMostThreeBlocksWithHeadingContextAndSkipsReferences() {
        List<String> chunks = DocumentChunker.chunk(List.of(
                heading("Paper", 1),
                heading("Methods", 2),
                paragraph("first unique paragraph"),
                paragraph("second unique paragraph"),
                paragraph("third unique paragraph"),
                paragraph("fourth unique paragraph"),
                block("reference", "Smith 2024", null)));

        assertThat(chunks).hasSize(2).allSatisfy(chunk -> {
            assertThat(chunk).startsWith("# Paper\n## Methods\n\n");
            assertThat(chunk).doesNotContain("Smith 2024");
            assertThat(chunk.length()).isLessThanOrEqualTo(2000);
        });
        assertThat(chunks.getFirst()).contains("first unique paragraph", "third unique paragraph")
                .doesNotContain("fourth unique paragraph");
        assertThat(chunks.getLast()).contains("fourth unique paragraph")
                .doesNotContain("first unique paragraph");
    }

    @Test
    void flushesWhenHeadingChanges() {
        List<String> chunks = DocumentChunker.chunk(List.of(
                heading("Methods", 1),
                paragraph("method evidence"),
                heading("Results", 1),
                paragraph("result evidence")));

        assertThat(chunks).containsExactly(
                "# Methods\n\nmethod evidence",
                "# Results\n\nresult evidence");
    }

    @Test
    void overlapsOnlySlicesOfOneLongBlock() {
        String text = "abcdefghijklmnopqrstuvwxyz".repeat(180);

        List<String> chunks = DocumentChunker.chunk(List.of(
                heading("Methods", 1),
                paragraph(text)));

        assertThat(chunks).hasSizeGreaterThan(1)
                .allSatisfy(chunk -> assertThat(chunk.length()).isLessThanOrEqualTo(2000));
        String firstBody = body(chunks.get(0));
        String secondBody = body(chunks.get(1));
        assertThat(secondBody.substring(0, 150))
                .isEqualTo(firstBody.substring(firstBody.length() - 150));
    }

    @Test
    void splitsLongTablesByRowsAndRepeatsCaptionAndHeader() {
        List<String> rows = new ArrayList<>();
        rows.add("| Model | Score |");
        rows.add("| --- | --- |");
        for (int index = 0; index < 100; index++) {
            rows.add("| model-" + index + " | " + "0.123456789 ".repeat(5) + " |");
        }

        List<String> chunks = DocumentChunker.chunk(List.of(
                heading("Results", 1),
                new AiModelClient.ExtractionBlock("table", String.join("\n", rows), null, "Table 1")));

        assertThat(chunks).hasSizeGreaterThan(1).allSatisfy(chunk -> {
            assertThat(chunk).startsWith("# Results\n\nTable 1\n\n| Model | Score |\n| --- | --- |");
            assertThat(chunk.length()).isLessThanOrEqualTo(2000);
        });
    }

    private static AiModelClient.ExtractionBlock heading(String text, int level) {
        return block("heading", text, level);
    }

    private static AiModelClient.ExtractionBlock paragraph(String text) {
        return block("paragraph", text, null);
    }

    private static AiModelClient.ExtractionBlock block(String type, String text, Integer level) {
        return new AiModelClient.ExtractionBlock(type, text, level, null);
    }

    private static String body(String chunk) {
        return chunk.substring(chunk.indexOf("\n\n") + 2);
    }
}
