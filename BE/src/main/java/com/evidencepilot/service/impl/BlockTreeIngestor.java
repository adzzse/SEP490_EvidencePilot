package com.evidencepilot.service.impl;

import com.evidencepilot.model.Document;
import com.evidencepilot.model.DocumentMetadata;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.service.AiModelClient;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * AST ingestion: one pass over {@code extraction.json} blocks, no markdown
 * regex partitioning. Rules:
 * <ul>
 *   <li>Only general (top-level) headings become sections; deeper headings
 *       (higher level, or dotted numbers like 3.1) stay inside the current
 *       section as {@code ###} subheadings.</li>
 *   <li>KEYWORDS never becomes a node: its text goes to metadata and is
 *       appended to the Abstract section when one exists.</li>
 *   <li>All reference blocks merge into a single References section.</li>
 *   <li>Preamble blocks (before the first section heading) become
 *       {@link DocumentMetadata}.</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
public class BlockTreeIngestor {

    /** Gap ordering: inserts fit between neighbours; contiguity not required. */
    public static final int ORDER_STEP = 1024;

    private static final Pattern EMAIL =
            Pattern.compile("[A-Za-z0-9._%+\\-]+@[A-Za-z0-9.\\-]+\\.[A-Za-z]{2,}");
    private static final Pattern LABEL_PREFIX =
            Pattern.compile("^(abstract|summary|keywords|index terms|key words)\\s*:\\s*(.*)$",
                    Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
    /** Dotted arabic numbering (3.1, 3.1.2) marks a sub-section of 3. */
    private static final Pattern DOTTED_NUMBER =
            Pattern.compile("^(\\d+(?:\\.\\d+)+)\\b");

    private final ObjectMapper objectMapper;

    public record IngestionResult(DocumentMetadata metadata, List<PaperSection> sections) {
    }

    public IngestionResult ingest(Document document, List<AiModelClient.ExtractionBlock> blocks) {
        int firstSectionIdx = firstSectionIndex(blocks);
        DocumentMetadata metadata = new DocumentMetadata();
        metadata.setDocument(document);
        metadata.setExtractionSource("blocks");
        metadata.setCreatedAt(LocalDateTime.now());
        metadata.setUpdatedAt(LocalDateTime.now());

        List<Seed> seeds = new ArrayList<>();
        if (firstSectionIdx < 0) {
            parsePreamble(blocks, 0, blocks.size(), metadata, seeds);
        } else {
            parsePreamble(blocks, 0, firstSectionIdx, metadata, seeds);
            parseBody(blocks, firstSectionIdx, metadata, seeds);
        }
        Seed paperInfo = buildPaperInfoSeed(document, metadata);
        if (paperInfo != null) {
            seeds.add(0, paperInfo);
        }

        List<PaperSection> sections = new ArrayList<>();
        int order = ORDER_STEP;
        for (Seed seed : seeds) {
            PaperSection section = new PaperSection();
            section.setDocument(document);
            section.setSectionOrder(order);
            order += ORDER_STEP;
            section.setSectionTitle(seed.title);
            section.setHeadingLevel(2);
            section.setSourceBlockStart(seed.blockStart);
            section.setSourceBlockEnd(seed.blockEnd);
            section.setContentTex(seed.body.toString());
            sections.add(section);
        }
        return new IngestionResult(metadata, sections);
    }

    /** Section 0: extracted frontmatter snapshot (title, authors, DOI, keywords). */
    private Seed buildPaperInfoSeed(Document document, DocumentMetadata metadata) {
        List<String> lines = new ArrayList<>();
        if (metadata.getTitle() != null && !metadata.getTitle().isBlank()) {
            lines.add("\\textbf{Title:} " + metadata.getTitle().strip());
        }
        List<String> names = new ArrayList<>();
        LinkedHashSet<String> affiliations = new LinkedHashSet<>();
        LinkedHashSet<String> emails = new LinkedHashSet<>();
        try {
            com.fasterxml.jackson.databind.JsonNode authors =
                    objectMapper.readTree(metadata.getAuthorsJson() == null ? "[]" : metadata.getAuthorsJson());
            if (authors.isArray()) {
                for (com.fasterxml.jackson.databind.JsonNode author : authors) {
                    String name = author.path("name").asText("").strip();
                    if (!name.isBlank()) {
                        names.add(name.length() > 200 ? name.substring(0, 200) : name);
                    }
                    for (com.fasterxml.jackson.databind.JsonNode value : author.path("affiliations")) {
                        String affiliation = value.asText("").strip();
                        if (!affiliation.isBlank()) {
                            affiliations.add(affiliation);
                        }
                    }
                    for (com.fasterxml.jackson.databind.JsonNode value : author.path("emails")) {
                        String email = value.asText("").strip();
                        if (!email.isBlank()) {
                            emails.add(email);
                        }
                    }
                }
            }
        } catch (Exception ignored) {
            // ponytail: malformed authors payload degrades to fewer lines, never a failed ingest.
        }
        if (!names.isEmpty()) {
            lines.add("\\textbf{Authors:} " + String.join("; ", names));
        }
        if (!affiliations.isEmpty()) {
            lines.add("\\textbf{Affiliations:} " + String.join("; ", affiliations));
        }
        if (!emails.isEmpty()) {
            lines.add("\\textbf{Emails:} " + String.join("; ", emails));
        }
        if (document.getDoi() != null && !document.getDoi().isBlank()) {
            lines.add("\\textbf{DOI:} " + document.getDoi().strip());
        }
        if (metadata.getKeywords() != null && !metadata.getKeywords().isBlank()) {
            lines.add("\\textbf{Keywords:} " + metadata.getKeywords().strip());
        }
        if (lines.isEmpty()) {
            return null;
        }
        Seed seed = new Seed("Paper Info", 0, 0);
        lines.forEach(seed::append);
        return seed;
    }

    private static final class Seed {
        final String title;
        final StringBuilder body = new StringBuilder();
        int blockStart;
        int blockEnd;

        Seed(String title, int blockStart, int blockEnd) {
            this.title = title;
            this.blockStart = blockStart;
            this.blockEnd = blockEnd;
        }

        void append(String text) {
            if (text == null || text.isBlank()) {
                return;
            }
            if (!body.isEmpty()) {
                body.append("\n\n");
            }
            body.append(text.strip());
        }
    }

    private static int firstSectionIndex(List<AiModelClient.ExtractionBlock> blocks) {
        int fallback = -1;
        for (int i = 0; i < blocks.size(); i++) {
            if (!isSectionBoundary(blocks.get(i))) {
                continue;
            }
            if (fallback < 0) {
                fallback = i;
            }
            if (!isKeywordsHeading(blocks.get(i).text())) {
                return i;
            }
        }
        return fallback;
    }

    private static boolean isSectionBoundary(AiModelClient.ExtractionBlock block) {
        if (block == null) {
            return false;
        }
        if ("reference".equals(block.type())) {
            return true;
        }
        return "heading".equals(block.type())
                && block.level() != null && block.level() >= 2;
    }

    private static int resolveSectionLevel(List<AiModelClient.ExtractionBlock> blocks, int from) {
        int level = Integer.MAX_VALUE;
        for (int i = from; i < blocks.size(); i++) {
            AiModelClient.ExtractionBlock block = blocks.get(i);
            if (!isSectionBoundary(block) || isKeywordsHeading(block.text())) {
                continue;
            }
            int candidate = "reference".equals(block.type()) ? 2 : block.level();
            level = Math.min(level, candidate);
        }
        return level == Integer.MAX_VALUE ? 2 : level;
    }

    private void parsePreamble(List<AiModelClient.ExtractionBlock> blocks, int from, int to,
            DocumentMetadata metadata, List<Seed> seeds) {
        List<AuthorDraft> authors = new ArrayList<>();
        Seed frontMatter = null;
        boolean titleSet = false;
        for (int i = from; i < to; i++) {
            AiModelClient.ExtractionBlock block = blocks.get(i);
            if (block == null || block.text() == null || block.text().isBlank()) {
                continue;
            }
            if ("heading".equals(block.type()) && block.level() != null && block.level() == 1) {
                if (!titleSet) {
                    metadata.setTitle(truncate(block.text().strip(), 1000));
                    titleSet = true;
                } else {
                    frontMatter = frontMatter(seeds, frontMatter, from, to);
                    frontMatter.append(block.text().strip());
                }
                continue;
            }
            if ("reference".equals(block.type())) {
                frontMatter = frontMatter(seeds, frontMatter, from, to);
                frontMatter.append(block.text().strip());
                continue;
            }
            String text = block.text().strip();
            Matcher labeled = LABEL_PREFIX.matcher(text);
            if (labeled.matches()) {
                String label = labeled.group(1).toLowerCase(Locale.ROOT);
                String value = labeled.group(2).strip();
                if (label.startsWith("abstract") || label.startsWith("summary")) {
                    if (findSeed(seeds, "abstract") == null) {
                        Seed abstractSeed = new Seed("Abstract", i, i + 1);
                        abstractSeed.append(value);
                        seeds.add(abstractSeed);
                    } else {
                        frontMatter = frontMatter(seeds, frontMatter, from, to);
                        frontMatter.append(text);
                    }
                } else if (!value.isBlank()) {
                    setKeywords(metadata, seeds, value);
                }
                continue;
            }
            if (!titleSet) {
                String firstLine = firstLine(text);
                if (!firstLine.isBlank()) {
                    metadata.setTitle(truncate(firstLine, 1000));
                    titleSet = true;
                    String rest = text.substring(firstLine.length()).strip();
                    if (!rest.isBlank()) {
                        frontMatter = classifyAuthorBlock(rest, authors, seeds, frontMatter, from, to);
                    }
                    continue;
                }
            }
            frontMatter = classifyAuthorBlock(text, authors, seeds, frontMatter, from, to);
        }
        pendingAuthors(authors, metadata);
    }

    private void parseBody(List<AiModelClient.ExtractionBlock> blocks, int from,
            DocumentMetadata metadata, List<Seed> seeds) {
        int sectionLevel = resolveSectionLevel(blocks, from);
        Seed current = null;
        boolean currentIsReferences = false;
        for (int i = from; i <= blocks.size(); i++) {
            AiModelClient.ExtractionBlock block = i < blocks.size() ? blocks.get(i) : null;
            boolean boundary = block != null && isSectionBoundary(block);
            if (boundary && isKeywordsHeading(block.text())) {
                // Consume KEYWORDS + following body into metadata and the Abstract section.
                StringBuilder keywords = new StringBuilder();
                int j = i + 1;
                while (j < blocks.size() && !isSectionBoundary(blocks.get(j))) {
                    if (blocks.get(j) != null && blocks.get(j).text() != null
                            && !blocks.get(j).text().isBlank()) {
                        if (!keywords.isEmpty()) {
                            keywords.append(' ');
                        }
                        keywords.append(collapse(blocks.get(j).text()));
                    }
                    j++;
                }
                if (!keywords.isEmpty()) {
                    setKeywords(metadata, seeds, current, keywords.toString());
                }
                i = j - 1;
                continue;
            }
            if (boundary && "reference".equals(block.type())) {
                String refText = block.text() == null ? "" : block.text().strip();
                if (currentIsReferences) {
                    if (current != null && !isReferencesHeader(refText)) {
                        current.append(refText);
                        current.blockEnd = i + 1;
                    }
                } else {
                    if (current != null) {
                        current.blockEnd = i;
                        seeds.add(current);
                    }
                    current = new Seed("References", i, i + 1);
                    currentIsReferences = true;
                    if (!isReferencesHeader(refText)) {
                        current.append(refText);
                    }
                }
                continue;
            }
            if (boundary) {
                if (currentIsReferences) {
                    current.blockEnd = i;
                    seeds.add(current);
                    current = null;
                    currentIsReferences = false;
                }
                if (isSubsection(block, sectionLevel) && current != null) {
                    current.append(subheadingLine(block));
                    current.blockEnd = i + 1;
                    continue;
                }
                if (current != null) {
                    current.blockEnd = i;
                    seeds.add(current);
                }
                current = new Seed(truncate(block.text().strip(), 255), i, i + 1);
                currentIsReferences = false;
                continue;
            }
            if (i == blocks.size()) {
                if (current != null) {
                    current.blockEnd = i;
                    seeds.add(current);
                }
                continue;
            }
            if (block != null && block.text() != null && !block.text().isBlank()) {
                if (current == null) {
                    current = new Seed("Full Text", i, i + 1);
                    currentIsReferences = false;
                }
                current.append(block.text().strip());
            }
        }
    }

    /** Deeper level, or dotted number (3.1 under 3): stays inside the current section. */
    private static boolean isSubsection(AiModelClient.ExtractionBlock block, int sectionLevel) {
        if (block.level() != null && block.level() > sectionLevel) {
            return true;
        }
        return numberDepth(block.text()) > 1;
    }

    private static int numberDepth(String text) {
        if (text == null) {
            return 0;
        }
        Matcher matcher = DOTTED_NUMBER.matcher(text.strip());
        if (!matcher.find()) {
            return text.strip().matches("(?s)^\\d+[\\).\u3002].*") ? 1 : 0;
        }
        int depth = 1;
        for (char c : matcher.group(1).toCharArray()) {
            if (c == '.') {
                depth++;
            }
        }
        return depth;
    }

    private static String subheadingLine(AiModelClient.ExtractionBlock block) {
        return "\\textbf{" + block.text().strip() + "}";
    }

    private static boolean isReferencesHeader(String text) {
        String normalized = normalizeTitle(text);
        return normalized.equals("references")
                || normalized.equals("reference")
                || normalized.equals("bibliography")
                || normalized.equals("works cited");
    }

    private static boolean isKeywordsHeading(String text) {
        String normalized = normalizeTitle(text);
        return "keywords".equals(normalized)
                || "index terms".equals(normalized)
                || "key words".equals(normalized);
    }

    private static String normalizeTitle(String text) {
        if (text == null) {
            return "";
        }
        return text.strip().replaceAll("\\s+", " ").toLowerCase(Locale.ROOT);
    }

    private static Seed findSeed(List<Seed> seeds, String title) {
        for (Seed seed : seeds) {
            if (seed.title.equalsIgnoreCase(title)) {
                return seed;
            }
        }
        return null;
    }

    private static Seed frontMatter(List<Seed> seeds, Seed frontMatter, int from, int to) {
        if (frontMatter == null) {
            frontMatter = new Seed("Front Matter", from, to);
            seeds.add(frontMatter);
        }
        return frontMatter;
    }

    /** Keywords live in metadata and are appended to Abstract when one exists. */
    private static void setKeywords(DocumentMetadata metadata, List<Seed> seeds, String value) {
        setKeywords(metadata, seeds, null, value);
    }

    private static void setKeywords(DocumentMetadata metadata, List<Seed> seeds,
            Seed current, String value) {
        String collapsed = truncate(collapse(value), 1000);
        if (collapsed.isBlank()) {
            return;
        }
        if (metadata.getKeywords() == null || metadata.getKeywords().isBlank()) {
            metadata.setKeywords(collapsed);
        }
        Seed abstractSeed = current != null && current.title.equalsIgnoreCase("abstract")
                ? current : findSeed(seeds, "abstract");
        if (abstractSeed != null
                && !containsNormalized(abstractSeed.body.toString(), collapsed)) {
            abstractSeed.append("Keywords: " + collapsed);
        }
    }

    public static boolean containsNormalized(String haystack, String needle) {
        if (haystack == null || needle == null || needle.isBlank()) {
            return false;
        }
        return collapse(haystack).toLowerCase(Locale.ROOT)
                .contains(collapse(needle).toLowerCase(Locale.ROOT));
    }

    private Seed classifyAuthorBlock(String text, List<AuthorDraft> authors,
            List<Seed> seeds, Seed frontMatter, int from, int to) {
        List<String> emails = new ArrayList<>();
        Matcher matcher = EMAIL.matcher(text);
        while (matcher.find()) {
            String email = matcher.group().toLowerCase(Locale.ROOT);
            if (email.length() <= 320 && !emails.contains(email)) {
                emails.add(email);
            }
        }
        List<String> lines = new ArrayList<>();
        for (String line : text.split("\\R")) {
            String stripped = EMAIL.matcher(line).replaceAll(" ").strip().replaceAll("\\s+", " ");
            if (!stripped.isBlank()) {
                lines.add(truncate(stripped, 500));
            }
        }
        boolean shortBlock = lines.size() <= 4 && text.length() <= 400;
        if ((!lines.isEmpty() || !emails.isEmpty()) && (!emails.isEmpty() || shortBlock)) {
            String name = lines.isEmpty() ? "" : lines.get(0);
            List<String> affiliations = lines.size() > 1 ? lines.subList(1, lines.size()) : List.of();
            authors.add(new AuthorDraft(name, new ArrayList<>(affiliations), emails));
            return frontMatter;
        }
        Seed leftovers = frontMatter(seeds, frontMatter, from, to);
        leftovers.append(text);
        return leftovers;
    }

    private record AuthorDraft(String name, List<String> affiliations, List<String> emails) {
    }

    private void pendingAuthors(List<AuthorDraft> authors, DocumentMetadata metadata) {
        List<Map<String, Object>> sanitized = new ArrayList<>();
        for (AuthorDraft draft : authors) {
            String name = truncate(draft.name().strip(), 500);
            if (name.isBlank() && draft.emails().isEmpty()) {
                continue;
            }
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("name", name);
            entry.put("affiliations", draft.affiliations().stream()
                    .map(a -> truncate(a.strip(), 500))
                    .filter(a -> !a.isBlank()).toList());
            entry.put("emails", draft.emails());
            sanitized.add(entry);
            if (sanitized.size() == 200) {
                break;
            }
        }
        try {
            metadata.setAuthorsJson(objectMapper.writeValueAsString(sanitized));
        } catch (Exception exception) {
            metadata.setAuthorsJson("[]");
        }
        if (metadata.getAuthorsJson() == null) {
            metadata.setAuthorsJson("[]");
        }
    }

    private static String firstLine(String text) {
        int end = text.indexOf('\n');
        return (end < 0 ? text : text.substring(0, end)).strip();
    }

    private static String collapse(String text) {
        return text.strip().replaceAll("\\s+", " ");
    }

    private static String truncate(String text, int max) {
        if (text == null) {
            return null;
        }
        return text.length() <= max ? text : text.substring(0, max);
    }
}
