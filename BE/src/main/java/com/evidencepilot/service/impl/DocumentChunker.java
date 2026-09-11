package com.evidencepilot.service.impl;

import com.evidencepilot.service.AiModelClient;

import java.util.ArrayList;
import java.util.List;

final class DocumentChunker {

    static final int MAX_CHARS = 2000;
    static final int MAX_BLOCKS = 3;
    static final int LONG_BLOCK_OVERLAP = 150;

    private DocumentChunker() {
    }

    static List<String> chunk(List<AiModelClient.ExtractionBlock> blocks) {
        if (blocks == null || blocks.isEmpty()) {
            return List.of();
        }

        List<String> chunks = new ArrayList<>();
        List<String> current = new ArrayList<>();
        String[] headings = new String[6];
        String prefix = "";

        for (AiModelClient.ExtractionBlock block : blocks) {
            if (block == null || "reference".equals(block.type())) {
                continue;
            }
            if ("heading".equals(block.type())) {
                flush(chunks, prefix, current);
                updateHeadings(headings, block);
                prefix = headingPrefix(headings);
                continue;
            }

            String rendered = render(block);
            if (rendered.isBlank()) {
                continue;
            }
            if ("table".equals(block.type()) && composedLength(prefix, rendered) > MAX_CHARS) {
                flush(chunks, prefix, current);
                splitTable(chunks, prefix, block);
                continue;
            }
            if (composedLength(prefix, rendered) > MAX_CHARS) {
                flush(chunks, prefix, current);
                splitLongBlock(chunks, prefix, rendered);
                continue;
            }

            List<String> candidate = new ArrayList<>(current);
            candidate.add(rendered);
            if (current.size() == MAX_BLOCKS || composedLength(prefix, String.join("\n\n", candidate)) > MAX_CHARS) {
                flush(chunks, prefix, current);
            }
            current.add(rendered);
        }

        flush(chunks, prefix, current);
        return chunks;
    }

    private static void updateHeadings(String[] headings, AiModelClient.ExtractionBlock block) {
        int index = block.level() - 1;
        headings[index] = block.text().strip();
        for (int deeper = index + 1; deeper < headings.length; deeper++) {
            headings[deeper] = null;
        }
    }

    private static String headingPrefix(String[] headings) {
        List<String> lines = new ArrayList<>();
        for (int index = 0; index < headings.length; index++) {
            if (headings[index] != null && !headings[index].isBlank()) {
                lines.add("#".repeat(index + 1) + " " + headings[index]);
            }
        }
        return String.join("\n", lines);
    }

    private static String render(AiModelClient.ExtractionBlock block) {
        if ("image".equals(block.type())) {
            return block.caption() == null ? "" : block.caption().strip();
        }
        String text = block.text().strip();
        if (block.caption() == null || block.caption().isBlank()) {
            return text;
        }
        return block.caption().strip() + "\n\n" + text;
    }

    private static void flush(List<String> chunks, String prefix, List<String> current) {
        if (current.isEmpty()) {
            return;
        }
        chunks.add(compose(prefix, String.join("\n\n", current)));
        current.clear();
    }

    private static String compose(String prefix, String body) {
        return prefix.isBlank() ? body : prefix + "\n\n" + body;
    }

    private static int composedLength(String prefix, String body) {
        return prefix.length() + (prefix.isBlank() ? 0 : 2) + body.length();
    }

    private static void splitLongBlock(List<String> chunks, String prefix, String text) {
        int capacity = MAX_CHARS - prefix.length() - (prefix.isBlank() ? 0 : 2);
        if (capacity <= LONG_BLOCK_OVERLAP) {
            throw new IllegalArgumentException("Heading context leaves no room for document content");
        }
        for (String slice : slices(text, capacity)) {
            chunks.add(compose(prefix, slice));
        }
    }

    private static List<String> slices(String text, int capacity) {
        List<String> slices = new ArrayList<>();
        int start = 0;
        while (start < text.length()) {
            int end = Math.min(start + capacity, text.length());
            if (end < text.length()) {
                end = findBoundary(text, start, end);
            }
            slices.add(text.substring(start, end));
            start = end < text.length() ? Math.max(end - LONG_BLOCK_OVERLAP, start + 1) : end;
        }
        return slices;
    }

    private static int findBoundary(String text, int start, int limit) {
        int minimum = start + (limit - start) / 2;
        int boundary = text.lastIndexOf('\n', limit - 1);
        if (boundary >= minimum) {
            return boundary + 1;
        }
        for (int index = limit - 1; index >= minimum; index--) {
            if (isSentenceBoundary(text, index)) {
                return index + 1;
            }
        }
        for (int index = limit - 1; index >= minimum; index--) {
            if (Character.isWhitespace(text.charAt(index))) {
                return index + 1;
            }
        }
        return limit;
    }

    private static boolean isSentenceBoundary(String text, int index) {
        char character = text.charAt(index);
        return (character == '.' || character == '?' || character == '!')
                && (index + 1 == text.length() || Character.isWhitespace(text.charAt(index + 1)));
    }

    private static void splitTable(
            List<String> chunks,
            String prefix,
            AiModelClient.ExtractionBlock block) {
        String[] lines = block.text().strip().split("\\R");
        if (lines.length < 3) {
            splitLongBlock(chunks, prefix, render(block));
            return;
        }

        String header = lines[0] + "\n" + lines[1];
        List<String> rows = new ArrayList<>();
        for (int index = 2; index < lines.length; index++) {
            String candidate = tableBody(block.caption(), header, rows, lines[index]);
            if (!rows.isEmpty() && composedLength(prefix, candidate) > MAX_CHARS) {
                chunks.add(compose(prefix, tableBody(block.caption(), header, rows, null)));
                rows.clear();
            }
            if (composedLength(prefix, tableBody(block.caption(), header, List.of(), lines[index])) > MAX_CHARS) {
                splitOversizedTableRow(chunks, prefix, block.caption(), header, lines[index]);
            } else {
                rows.add(lines[index]);
            }
        }
        if (!rows.isEmpty()) {
            chunks.add(compose(prefix, tableBody(block.caption(), header, rows, null)));
        }
    }

    private static void splitOversizedTableRow(
            List<String> chunks,
            String prefix,
            String caption,
            String header,
            String row) {
        String base = tableBody(caption, header, List.of(), null);
        int capacity = MAX_CHARS - composedLength(prefix, base + "\n");
        if (capacity <= LONG_BLOCK_OVERLAP) {
            throw new IllegalArgumentException("Table header leaves no room for table rows");
        }
        for (String slice : slices(row, capacity)) {
            chunks.add(compose(prefix, base + "\n" + slice));
        }
    }

    private static String tableBody(String caption, String header, List<String> rows, String extraRow) {
        List<String> parts = new ArrayList<>();
        if (caption != null && !caption.isBlank()) {
            parts.add(caption.strip());
            parts.add("");
        }
        parts.add(header);
        parts.addAll(rows);
        if (extraRow != null) {
            parts.add(extraRow);
        }
        return String.join("\n", parts);
    }
}
