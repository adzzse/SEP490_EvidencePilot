package com.evidencepilot.service;

import com.evidencepilot.exception.ResourceNotFoundException;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.PaperSectionType;
import com.evidencepilot.model.enums.PaperStandard;
import com.evidencepilot.dto.response.TraceabilityExportResponse;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.DocumentMetadataRepository;
import com.evidencepilot.repository.PaperSectionRepository;
import com.evidencepilot.repository.ProjectRepository;
import com.evidencepilot.service.impl.SourceMatchingService;
import com.evidencepilot.service.impl.TraceabilityExportServiceImpl;
import com.evidencepilot.service.impl.ProjectCsvArchive;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.ArrayList;
import java.util.Locale;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class TexArchiveBuilder {

    private final ProjectRepository projectRepository;
    private final DocumentRepository documentRepository;
    private final PaperSectionRepository paperSectionRepository;
    private final DocumentMetadataRepository documentMetadataRepository;
    private final PaperStandardService paperStandardService;
    private final TexArchiveMediaWriter mediaWriter;
    private final SourceMatchingService sourceMatchingService;
    private final TraceabilityExportServiceImpl projectDataService;
    private final ObjectMapper objectMapper;

    public Path build(UUID projectId, User viewer) {
        Path destination;
        try {
            destination = Files.createTempFile("evidencepilot-project-export-", ".zip");
        } catch (IOException exception) {
            throw new IllegalStateException("Failed to create export archive", exception);
        }
        try {
            write(projectId, destination, viewer);
            return destination;
        } catch (RuntimeException exception) {
            try {
                Files.deleteIfExists(destination);
            } catch (IOException cleanupException) {
                exception.addSuppressed(cleanupException);
            }
            throw exception;
        }
    }

    public void write(UUID projectId, Path destination, User viewer) {
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new ResourceNotFoundException(projectId, "Project"));
        List<Document> papers = documentRepository
                .findByProjectIdAndDocTypeAndActiveTrue(projectId, DocumentType.PAPER);
        List<PaperSection> sections = papers.stream()
                .flatMap(paper -> paperSectionRepository
                        .findByDocumentIdOrderBySectionOrderAsc(paper.getId()).stream())
                .filter(PaperSection::isActive)
                .toList();
        CitationBibliography.Result bibliography = bibliographyFor(papers, sections);
        List<String> citationWarnings = new ArrayList<>();
        bibliography.unresolvedKeys().forEach(key -> citationWarnings.add(
                        "Auto citation `" + key + "` no longer resolves to a declared paper reference."));

        try (OutputStream output = Files.newOutputStream(destination);
                ZipOutputStream zip = new ZipOutputStream(output, StandardCharsets.UTF_8)) {
            StringBuilder body = new StringBuilder();
            int index = 1;
            boolean bibliographyInjected = false;
            for (Document paper : papers) {
                String keywords = documentMetadataRepository.findByDocumentId(paper.getId())
                        .map(meta -> meta.getKeywords())
                        .filter(value -> value != null && !value.isBlank())
                        .orElse(null);
                boolean keywordsInjected = false;
                for (PaperSection section : sections) {
                    if (section.getDocument() == null
                            || !paper.getId().equals(section.getDocument().getId())) {
                        continue;
                    }
                    // Paper Info is a workspace snapshot, not paper body — never export it.
                    if (isMetadataSection(section.getSectionTitle())) {
                        continue;
                    }
                    String content = translateSupSub(
                            section.getContentTex() == null ? "" : section.getContentTex());
                    boolean referenceSection = section.getSectionType() == PaperSectionType.REFERENCE;
                    if (referenceSection && content.isBlank() && !bibliography.entries().isEmpty()) {
                        continue;
                    }
                    if (referenceSection && !bibliographyInjected && !bibliography.entries().isEmpty()
                            && content.contains("\\begin{thebibliography}")
                            && content.contains(CitationBibliography.BIBLIOGRAPHY_END)) {
                        content = content.replace(
                                CitationBibliography.BIBLIOGRAPHY_END,
                                "\\input{references.tex}\n" + CitationBibliography.BIBLIOGRAPHY_END);
                        bibliographyInjected = true;
                    } else if (referenceSection && !bibliography.entries().isEmpty() && !content.isBlank()) {
                        citationWarnings.add(
                                "Manual References content was preserved; generated references were appended.");
                    }
                    // Keywords live in document_metadata — inject where LaTeX expects
                    // them (right after the abstract), never as their own \section.
                    // The ingestor usually merges them into the Abstract already;
                    // inject only when they are missing to avoid duplication.
                    if (!keywordsInjected && keywords != null
                            && "abstract".equals(normalizedTitle(section.getSectionTitle()))) {
                        keywordsInjected = true;
                        if (!com.evidencepilot.service.impl.BlockTreeIngestor
                                .containsNormalized(content, keywords)) {
                            content += "\n\n" + keywordsLatex(project, keywords) + "\n";
                        }
                    }
                    String filename = String.format(
                            "%02d-%s.tex", index++, sanitizeFilename(section.getSectionTitle()));
                    body.append("\\input{sections/").append(filename).append("}\n");
                    writeEntry(zip, "sections/" + filename,
                            sectionCommand(section.getHeadingLevel())
                                    + "{" + CitationBibliography.escapeLatex(section.getSectionTitle()) + "}\n\n"
                                    + content + "\n");
                }
                if (keywords != null && !keywordsInjected) {
                    // No abstract section (or papers without one): standalone fragment
                    // right after this paper's sections so nothing is lost.
                    String filename = String.format("%02d-keywords.tex", index++);
                    body.append("\\input{sections/").append(filename).append("}\n");
                    writeEntry(zip, "sections/" + filename,
                            keywordsLatex(project, keywords) + "\n");
                }
            }
            if (!bibliography.entries().isEmpty()) {
                if (!bibliographyInjected) {
                    body.append("\\input{references.tex}\n");
                }
                writeEntry(zip, "references.tex", bibliography.toLatex(!bibliographyInjected));
            }
            writeEntry(zip, "main.tex", paperStandardService.renderTemplate(
                    project.getTargetStandard(),
                    CitationBibliography.escapeLatex(
                            project.getTitle() == null ? "Untitled" : project.getTitle()),
                    body.toString()));
            if (!citationWarnings.isEmpty()) {
                writeEntry(zip, "CITATION_WARNINGS.md", citationWarningText(citationWarnings));
            }
            TraceabilityExportResponse data = projectDataService.buildDataForArchive(projectId, viewer);
            writeEntry(zip, "project-summary.tex", projectSummary(data));
            writeEntry(zip, "data/project-data.json", objectMapper.writeValueAsString(data));
            ProjectCsvArchive.writeEntries(data, zip, "data/");
            projectDataService.writeFeedbackAttachments(projectId, viewer, zip);
            mediaWriter.writeProjectMedia(projectId, zip);
        } catch (IOException exception) {
            throw new IllegalStateException("Failed to build export archive", exception);
        }
    }
    private CitationBibliography.Result bibliographyFor(List<Document> papers, List<PaperSection> sections) {
        java.util.Map<String, Integer> citationNumbers = new java.util.LinkedHashMap<>();
        List<CitationBibliography.Entry> entries = new ArrayList<>();
        List<String> unresolvedKeys = new ArrayList<>();
        for (Document paper : papers) {
            List<PaperSection> paperSections = sections.stream()
                    .filter(section -> section.getDocument() != null
                            && paper.getId().equals(section.getDocument().getId()))
                    .toList();
            CitationBibliography.Result resolved = CitationBibliography.resolve(
                    paperSections, sourceMatchingService.referenceSources(paper.getId()));
            for (CitationBibliography.Entry entry : resolved.entries()) {
                if (citationNumbers.containsKey(entry.key())) {
                    continue;
                }
                citationNumbers.put(entry.key(), entries.size() + 1);
                entries.add(new CitationBibliography.Entry(
                        entry.key(), entries.size() + 1, entry.reference(), entry.latex()));
            }
            unresolvedKeys.addAll(resolved.unresolvedKeys());
        }
        return new CitationBibliography.Result(citationNumbers, entries, unresolvedKeys);
    }

    private static String citationWarningText(List<String> warnings) {
        StringBuilder content = new StringBuilder("# Citation export warnings\n\n");
        warnings.forEach(warning -> content.append("- ").append(warning).append('\n'));
        return content.toString();
    }

    private static String projectSummary(TraceabilityExportResponse data) {
        StringBuilder out = new StringBuilder("% Supplemental export summary; main.tex remains the paper manuscript.\n");
        out.append("\\section*{Project summary}\n")
                .append("\\textbf{Project:} ").append(tex(data.projectTitle())).append("\\\\\n")
                .append("\\textbf{Description:} ").append(tex(data.projectDescription())).append("\\\\\n")
                .append("\\textbf{Status:} ").append(tex(data.projectStatus())).append("\\\\\n")
                .append("\\textbf{Paper standard:} ").append(tex(data.targetStandard())).append("\\\\\n")
                .append("\\textbf{Papers:} ").append(data.papers().size()).append("\\\\\n")
                .append("\\textbf{Sources:} ").append(data.sources().size()).append("\\\\\n")
                .append("\\textbf{Saved source relations:} ").append(data.sourceRelations().size()).append("\\\\\n")
                .append("\\textbf{Feedback items:} ").append(data.feedbackComments().size()).append("\\\\\n")
                .append("\\textbf{Feedback replies:} ").append(data.feedbackReplies().size()).append("\\\\\n")
                .append("\\textbf{Feedback attachments:} ").append(data.feedbackAttachments().size()).append("\\\\\n")
                .append("\\textbf{Evidence traces:} ").append(data.traces().size()).append("\n");
        out.append("\\subsection*{Project sources}\n\\begin{itemize}\n");
        for (var source : data.sources()) {
            out.append("\\item ").append(tex(source.title() == null ? source.filename() : source.title()))
                    .append("; ").append(tex(source.authors())).append("; ").append(tex(source.publicationYear()))
                    .append("; DOI: ").append(tex(source.doi())).append("\n");
        }
        out.append("\\end{itemize}\n\\subsection*{Saved citation relations}\n\\begin{itemize}\n");
        java.util.Map<String, String> labels = new java.util.HashMap<>();
        data.sources().forEach(source -> labels.put("source:" + source.id(),
                source.title() == null ? source.filename() : source.title()));
        data.externalReferences().forEach(reference -> labels.put(reference.id(), reference.title()));
        for (var relation : data.sourceRelations()) {
            out.append("\\item ").append(tex(labels.get(relation.sourceId()))).append(" $\\rightarrow$ ")
                    .append(tex(labels.get(relation.targetId()))).append("\n");
        }
        out.append("\\end{itemize}\n\\subsection*{Published feedback}\n\\begin{itemize}\n");
        for (var comment : data.feedbackComments()) {
            out.append("\\item ").append(tex(comment.content()))
                    .append(" (state: ").append(tex(comment.threadState())).append(")\n");
        }
        for (var reply : data.feedbackReplies()) {
            out.append("\\item Reply to ").append(tex(reply.feedbackId())).append(": ")
                    .append(tex(reply.content())).append("\n");
        }
        for (var attachment : data.feedbackAttachments()) {
            out.append("\\item Attachment for ").append(tex(attachment.feedbackId())).append(": ")
                    .append(tex(attachment.archivePath())).append("\n");
        }
        out.append("\\end{itemize}\n\\subsection*{Evidence traces}\n\\begin{itemize}\n");
        for (var trace : data.traces()) {
            out.append("\\item ").append(tex(trace.sectionTitle())).append(": ").append(tex(trace.excerpt()))
                    .append("; evidence: ").append(tex(trace.evidenceQuote()))
                    .append("; outcome: ").append(tex(trace.outcome()))
                    .append("; judgment: ").append(tex(trace.judgment())).append("\n");
        }
        out.append("\\end{itemize}\n");
        out.append("\\subsection*{Member progress}\n");
        for (var member : data.memberProgress()) {
            out.append(tex(member.userName())).append(": ")
                    .append(member.saveCount()).append(" saves; +")
                    .append(member.wordsAdded()).append("/-")
                    .append(member.wordsRemoved()).append(" words\\\\\n");
            for (var day : member.dailyWordDeltas()) {
                out.append("\\quad ").append(day.date()).append(": ").append(day.saveCount())
                        .append(" saves; +").append(day.wordsAdded()).append("/-")
                        .append(day.wordsRemoved()).append(" words\\\\\n");
            }
        }
        out.append("% Full project records are in data/project-data.json and the data/*.csv tables.\n");
        return out.toString();
    }

    private static String tex(Object value) {
        if (value == null) return "(none)";
        return CitationBibliography.escapeLatex(value.toString().replaceAll("\\s+", " ").strip());
    }

    private static boolean isMetadataSection(String title) {
        return "paper info".equals(normalizedTitle(title));
    }

    private static final java.util.regex.Pattern SUP_SUB = java.util.regex.Pattern.compile(
            "<(sup|sub)(?:\\s[^<>]*)?>(.*?)</\\1>",
            java.util.regex.Pattern.CASE_INSENSITIVE | java.util.regex.Pattern.DOTALL);

    /**
     * Translates preserved HTML super/subscripts to valid LaTeX.
     * Malformed or unclosed tags pass through untouched — never corrupt
     * output to fix markup.
     */
    static String translateSupSub(String content) {
        if (content == null || content.isBlank()) {
            return content;
        }
        java.util.regex.Matcher matcher = SUP_SUB.matcher(content);
        StringBuilder out = new StringBuilder();
        while (matcher.find()) {
            String latex = ("sup".equalsIgnoreCase(matcher.group(1)) ? "$^{" : "$_{")
                    + CitationBibliography.escapeLatex(matcher.group(2).strip()) + "}$";
            matcher.appendReplacement(out, java.util.regex.Matcher.quoteReplacement(latex));
        }
        matcher.appendTail(out);
        return out.toString();
    }

    private static String normalizedTitle(String title) {
        return title == null ? "" : title.trim().toLowerCase(Locale.ROOT);
    }

    private static String sectionCommand(Integer headingLevel) {
        if (headingLevel != null && headingLevel >= 4) {
            return "\\subsubsection";
        }
        if (headingLevel != null && headingLevel == 3) {
            return "\\subsection";
        }
        return "\\section";
    }

    private static String keywordsLatex(Project project, String keywords) {
        String escaped = CitationBibliography.escapeLatex(keywords.strip());
        PaperStandard standard = project == null ? null : project.getTargetStandard();
        if (standard == PaperStandard.IEEE) {
            return "\\begin{IEEEkeywords}\n" + escaped + "\n\\end{IEEEkeywords}";
        }
        if (standard == PaperStandard.ACM
                || standard == PaperStandard.SPRINGER_LNCS
                || standard == PaperStandard.APA) {
            return "\\keywords{" + escaped + "}";
        }
        return "\\textbf{Keywords:} " + escaped;
    }

    private static void writeEntry(ZipOutputStream zip, String name, String content)
            throws IOException {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(content.getBytes(StandardCharsets.UTF_8));
        zip.closeEntry();
    }

    private static String sanitizeFilename(String value) {
        String filename = value == null ? "" : value.toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("^-|-$", "");
        return filename.isBlank() ? "untitled" : filename;
    }
}
