package com.evidencepilot.service.impl;

import com.evidencepilot.service.AiModelClient;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Defensive downgrade for MinerU false-positive headings (e.g. bolded
 * "Takeaway" paragraphs classified as {@code type: "heading"}).
 *
 * <p>Short unnumbered non-academic headings are aggressively merged into the
 * open section as bolded paragraphs ({@code **Label:** body}), so visual
 * hierarchy survives even though the structural node is destroyed.
 */
public final class BlockNormalizer {

    private static final int MAX_HEADING_WORDS = 15;

    private static final Pattern DOTTED_NUMBER =
            Pattern.compile("^\\d+(?:\\.\\d+)*\\.?\\s+");
    private static final Pattern ROMAN_NUMBER =
            Pattern.compile("^(?:IV|IX|V?I{0,3}|X{1,3})[.)]?\\h+",
                    Pattern.CASE_INSENSITIVE);
    private static final Pattern APPENDIX_LABEL =
            Pattern.compile("^appendix\\h+[A-Z]\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern HEADING_NUMBER =
            Pattern.compile("^(?:\\d+(?:\\.\\d+)*|[IVXLCDM]+)[.)]?\\h+",
                    Pattern.CASE_INSENSITIVE);
    private static final Pattern LABEL_COLON =
            Pattern.compile("^(.{1,60}):\\s+(\\S.*)$", Pattern.DOTALL);

    private static final Set<String> CORE_HEADINGS = Set.of(
            "abstract", "introduction", "background",
            "related work", "related works",
            "methodology", "results", "discussion",
            "conclusion", "conclusions",
            "references", "appendix",
            "acknowledgement", "acknowledgements",
            "acknowledgment", "acknowledgments",
            "keywords");

    private static final Set<String> SECONDARY_HEADINGS = Set.of(
            "threats to validity", "experimental setup", "case study",
            "study design", "data collection", "limitations", "future work");

    private BlockNormalizer() {
    }

    public static List<AiModelClient.ExtractionBlock> normalizeBlocks(
            List<AiModelClient.ExtractionBlock> blocks) {
        if (blocks == null) {
            return List.of();
        }
        List<AiModelClient.ExtractionBlock> normalized = new ArrayList<>(blocks.size());
        for (AiModelClient.ExtractionBlock block : blocks) {
            normalized.add(block == null ? null : maybeDowngrade(block));
        }
        return normalized;
    }

    private static AiModelClient.ExtractionBlock maybeDowngrade(
            AiModelClient.ExtractionBlock block) {
        if (!"heading".equals(block.type()) || block.text() == null) {
            return block;
        }
        String text = block.text().strip();
        if (text.isEmpty() || isTitleLevel(block) || isKeywordsHeading(text)) {
            return block;
        }
        String stripped = stripHeadingNumber(text).strip();
        String normalized = normalize(stripped);
        if (CORE_HEADINGS.contains(normalized) || SECONDARY_HEADINGS.contains(normalized)) {
            return block;
        }
        if (DOTTED_NUMBER.matcher(text).find()
                || ROMAN_NUMBER.matcher(text).find()
                || APPENDIX_LABEL.matcher(text).find()) {
            return block;
        }
        if (wordCount(text) > MAX_HEADING_WORDS) {
            return downgrade(block, text);
        }
        // Gray zone: short, unnumbered, unlisted — aggressively downgrade.
        return downgrade(block, text);
    }

    private static AiModelClient.ExtractionBlock downgrade(
            AiModelClient.ExtractionBlock block, String text) {
        return new AiModelClient.ExtractionBlock(
                "paragraph", boldFallback(text), null, block.caption());
    }

    private static String boldFallback(String text) {
        // Canonical subsection markup is \textbf{} (rendered bold by Preview);
        // ** is never emitted so editors see one consistent format.
        Matcher labeled = LABEL_COLON.matcher(text);
        if (labeled.matches()) {
            return "\\textbf{" + labeled.group(1).strip() + ":} " + labeled.group(2).strip();
        }
        return "\\textbf{" + text + "}";
    }

    private static boolean isTitleLevel(AiModelClient.ExtractionBlock block) {
        return block.level() != null && block.level() < 2;
    }

    private static boolean isKeywordsHeading(String text) {
        String normalized = normalize(text);
        return normalized.equals("keywords")
                || normalized.equals("index terms")
                || normalized.equals("key words");
    }

    private static String stripHeadingNumber(String heading) {
        return HEADING_NUMBER.matcher(heading.strip()).replaceFirst("");
    }

    private static String normalize(String heading) {
        return heading.strip().replaceAll("\\s+", " ").toLowerCase(Locale.ROOT);
    }

    private static int wordCount(String text) {
        String stripped = text.strip();
        if (stripped.isEmpty()) {
            return 0;
        }
        return stripped.split("\\s+").length;
    }
}
