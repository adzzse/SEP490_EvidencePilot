package com.evidencepilot.service;

import com.evidencepilot.model.Document;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.service.impl.SourceMatchingService;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class CitationBibliography {

    static final String BIBLIOGRAPHY_END = "\\end{thebibliography}";
    private static final Pattern CITE_PATTERN = Pattern.compile(
            "\\\\cite(?:\\[[^\\]]*\\])?\\{([^}]+)\\}");

    private CitationBibliography() {
    }

    public static Result resolve(List<PaperSection> sections, List<Document> sources) {
        Map<String, Document> sourcesByKey = new LinkedHashMap<>();
        sources.forEach(source -> sourcesByKey.putIfAbsent(
                SourceMatchingService.citationKey(source.getId()), source));

        Map<String, Integer> citationNumbers = new LinkedHashMap<>();
        List<Entry> entries = new ArrayList<>();
        List<String> unresolvedKeys = new ArrayList<>();
        citationKeys(sections).stream().filter(key -> !sourcesByKey.containsKey(key))
                .forEach(unresolvedKeys::add);
        for (Map.Entry<String, Document> declared : sourcesByKey.entrySet()) {
            String key = declared.getKey();
            Document source = declared.getValue();
            int number = entries.size() + 1;
            citationNumbers.put(key, number);
            entries.add(new Entry(
                    key,
                    number,
                    referenceText(source),
                    referenceLatex(source)));
        }
        return new Result(citationNumbers, entries, unresolvedKeys);
    }

    static String escapeLatex(String value) {
        return value.replace("\\", "\\textbackslash{}")
                .replace("&", "\\&").replace("%", "\\%")
                .replace("$", "\\$").replace("#", "\\#")
                .replace("_", "\\_").replace("{", "\\{")
                .replace("}", "\\}").replace("~", "\\textasciitilde{}")
                .replace("^", "\\textasciicircum{}");
    }

    public static Set<String> citationKeys(List<PaperSection> sections) {
        Set<String> keys = new LinkedHashSet<>();
        for (PaperSection section : sections) {
            Matcher matcher = CITE_PATTERN.matcher(
                    section.getContentTex() == null ? "" : section.getContentTex().replaceAll("(?m)(?<!\\\\)%.*$", ""));
            while (matcher.find()) {
                for (String key : matcher.group(1).split(",")) {
                    String trimmed = key.trim();
                    if (SourceMatchingService.citationDocumentId(trimmed).isPresent()) {
                        keys.add(trimmed.toLowerCase(Locale.ROOT));
                    }
                }
            }
        }
        return keys;
    }

    public static String referenceText(Document source) {
        StringBuilder content = new StringBuilder();
        appendReference(source, content, false);
        return content.toString();
    }

    private static String referenceLatex(Document source) {
        StringBuilder content = new StringBuilder();
        appendReference(source, content, true);
        return content.toString();
    }

    private static void appendReference(Document source, StringBuilder content, boolean latex) {
        if (source.getAuthors() != null && !source.getAuthors().isBlank()) {
            content.append(latex ? escapeLatex(source.getAuthors()) : source.getAuthors()).append(". ");
        }
        String title = source.getTitle() == null || source.getTitle().isBlank()
                ? source.getOriginalFilename() : source.getTitle();
        if (title == null || title.isBlank()) {
            title = source.getId().toString();
        }
        if (latex) {
            content.append("\\textit{").append(escapeLatex(title)).append("}.");
        } else {
            content.append(title).append('.');
        }
        if (source.getPublisher() != null && !source.getPublisher().isBlank()) {
            content.append(' ')
                    .append(latex ? escapeLatex(source.getPublisher()) : source.getPublisher())
                    .append(',');
        }
        if (source.getPublicationYear() != null) {
            content.append(' ').append(source.getPublicationYear()).append('.');
        }
        if (source.getDoi() != null && !source.getDoi().isBlank()) {
            String doi = source.getDoi().replaceFirst(
                    "(?i)^https?://(?:dx\\.)?doi\\.org/", "");
            content.append(latex ? " \\url{https://doi.org/" : " https://doi.org/")
                    .append(doi)
                    .append(latex ? "}." : ".");
        }
    }

    public record Entry(String key, int number, String reference, String latex) {
    }

    public record Result(
            Map<String, Integer> citationNumbers,
            List<Entry> entries,
            List<String> unresolvedKeys) {

        public Result {
            citationNumbers = Collections.unmodifiableMap(new LinkedHashMap<>(citationNumbers));
            entries = List.copyOf(entries);
            unresolvedKeys = List.copyOf(unresolvedKeys);
        }

        public String toLatex(boolean includeEnvironment) {
            StringBuilder content = new StringBuilder();
            if (includeEnvironment) {
                content.append("\\begin{thebibliography}{99}\n");
            }
            for (Entry entry : entries) {
                content.append("\\bibitem{").append(entry.key()).append("}\n")
                        .append(entry.latex()).append("\n\n");
            }
            if (includeEnvironment) {
                content.append(BIBLIOGRAPHY_END).append('\n');
            }
            return content.toString();
        }
    }
}
