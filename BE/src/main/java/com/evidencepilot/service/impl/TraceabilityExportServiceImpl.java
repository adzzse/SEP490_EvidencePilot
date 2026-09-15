package com.evidencepilot.service.impl;

import com.evidencepilot.dto.response.TraceabilityExportResponse;
import com.evidencepilot.exception.ResourceNotFoundException;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.DocumentReference;
import com.evidencepilot.model.EvidenceRevisionTrace;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.ProjectDocument;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.repository.DocumentReferenceRepository;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.EvidenceRevisionTraceRepository;
import com.evidencepilot.repository.FeedbackRequestRepository;
import com.evidencepilot.repository.PaperSectionRepository;
import com.evidencepilot.repository.ProjectDocumentRepository;
import com.evidencepilot.repository.ProjectRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class TraceabilityExportServiceImpl {

    private static final String MISSING = "MISSING";

    private final ProjectRepository projectRepository;
    private final DocumentRepository documentRepository;
    private final DocumentReferenceRepository documentReferenceRepository;
    private final FeedbackRequestRepository feedbackRequestRepository;
    private final ProjectDocumentRepository projectDocumentRepository;
    private final PaperSectionRepository paperSectionRepository;
    private final EvidenceRevisionTraceRepository evidenceRevisionTraceRepository;
    private final CurrentUserServiceImpl currentUserService;

    public TraceabilityExportResponse exportTraceability(UUID projectId) {
        User currentUser = currentUserService.requireCurrentUser();
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new ResourceNotFoundException(projectId, "Project"));
        if (!project.isActive()) {
            throw new ResourceNotFoundException(projectId, "Project");
        }
        currentUserService.requireProjectAccess(currentUser, project);

        List<DocumentReference> references = documentReferenceRepository
                .findByDocumentProjectIdAndDocumentDocTypeAndDocumentActiveTrueOrderByDocumentIdAscReferenceIndexAsc(
                        projectId, DocumentType.SOURCE);
        Map<UUID, Long> referenceCountBySource = references.stream()
                .collect(Collectors.groupingBy(
                        reference -> reference.getDocument().getId(),
                        Collectors.counting()));

        List<Document> activeSources = new ArrayList<>();
        documentRepository.findByProjectIdAndDocTypeAndActiveTrue(projectId, DocumentType.SOURCE)
                .forEach(activeSources::add);
        projectDocumentRepository.findByProjectId(projectId).stream()
                .map(ProjectDocument::getDocument)
                .filter(doc -> doc.isActive() && doc.getDocType() == DocumentType.SOURCE)
                .filter(doc -> activeSources.stream().noneMatch(d -> d.getId().equals(doc.getId())))
                .forEach(activeSources::add);

        List<TraceabilityExportResponse.TraceabilitySource> sources = activeSources.stream()
                .map(source -> new TraceabilityExportResponse.TraceabilitySource(
                        source.getId(),
                        missingIfBlank(source.getOriginalFilename()),
                        missingIfBlank(source.getContentType()),
                        source.getFileSizeBytes(),
                        missingIfBlank(source.getFileUrl()),
                        referenceCountBySource.getOrDefault(source.getId(), 0L).intValue()))
                .toList();

        List<TraceabilityExportResponse.TraceabilitySection> sections = new ArrayList<>();
        for (Document paper : documentRepository
                .findByProjectIdAndDocTypeAndActiveTrue(projectId, DocumentType.PAPER)) {
            for (PaperSection section : paperSectionRepository
                    .findByDocumentIdOrderBySectionOrderAsc(paper.getId())) {
                if (!section.isActive()) continue;
                sections.add(new TraceabilityExportResponse.TraceabilitySection(
                        section.getId(),
                        missingIfBlank(section.getSectionTitle()),
                        wordCount(section.getContentTex()),
                        section.getVersion() != null ? section.getVersion() : 1,
                        section.getAssignedUser() == null ? null : section.getAssignedUser().getId()));
            }
        }

        List<TraceabilityExportResponse.TraceabilityFeedback> feedback = feedbackRequestRepository
                .findByProjectIdOrderByRequestedAtDesc(projectId)
                .stream()
                .map(request -> new TraceabilityExportResponse.TraceabilityFeedback(
                        request.getId(),
                        request.getInstructor() == null ? null : request.getInstructor().getId(),
                        request.getStatus()))
                .toList();

        List<TraceabilityExportResponse.TraceabilityTrace> traces = evidenceRevisionTraceRepository
                .findByProjectIdOrderByCreatedAtDesc(projectId)
                .stream()
                .map(this::toTrace)
                .toList();

        return new TraceabilityExportResponse(
                project.getId(),
                missingIfBlank(project.getTitle()),
                project.getStatus(),
                Instant.now(),
                sections,
                sources,
                feedback,
                traces);
    }

    private TraceabilityExportResponse.TraceabilityTrace toTrace(EvidenceRevisionTrace trace) {
        return new TraceabilityExportResponse.TraceabilityTrace(
                trace.getId(),
                trace.getSection().getId(),
                missingIfBlank(trace.getSection().getSectionTitle()),
                trace.getFindingIndex(),
                missingIfBlank(trace.getSuggestedAction()),
                missingIfBlank(trace.getExcerpt()),
                trace.getSource() == null ? null : trace.getSource().getId(),
                trace.getEvidenceQuote(),
                trace.getEvidenceRelation(),
                trace.getStudentAction() == null ? null : trace.getStudentAction().name(),
                trace.getOutcome() == null ? null : trace.getOutcome().name(),
                trace.getJudgment() == null ? null : trace.getJudgment().name());
    }

    public byte[] exportTraceabilityCsv(UUID projectId) {
        TraceabilityExportResponse data = exportTraceability(projectId);
        StringBuilder csv = new StringBuilder();
        csv.append('\uFEFF'); // BOM for Excel
        csv.append("Section ID,Section Title,Word Count,Version,Assigned User ID,Feedback Status\n");
        for (var section : data.sections()) {
            csv.append(escCsv(section.id().toString())).append(',')
               .append(escCsv(section.title())).append(',')
               .append(section.wordCount() != null ? section.wordCount() : "").append(',')
               .append(section.version() != null ? section.version() : "").append(',')
               .append(escCsv(section.assignedUserId() == null ? "" : section.assignedUserId().toString())).append(',')
               .append(escCsv(data.feedback().isEmpty() ? "NONE" : "PRESENT"))
               .append('\n');
        }
        csv.append("Trace ID,Section ID,Section Title,Finding,Action,Excerpt,Source ID,Evidence Quote,Relation,Student Action,Outcome,Judgment\n");
        for (var trace : data.traces()) {
            csv.append(escCsv(trace.id().toString())).append(',')
               .append(escCsv(trace.sectionId().toString())).append(',')
               .append(escCsv(trace.sectionTitle())).append(',')
               .append(trace.findingIndex() != null ? trace.findingIndex() : "").append(',')
               .append(escCsv(trace.suggestedAction())).append(',')
               .append(escCsv(trace.excerpt())).append(',')
               .append(escCsv(trace.sourceId() == null ? "" : trace.sourceId().toString())).append(',')
               .append(escCsv(trace.evidenceQuote())).append(',')
               .append(escCsv(trace.evidenceRelation())).append(',')
               .append(escCsv(trace.studentAction())).append(',')
               .append(escCsv(trace.outcome())).append(',')
               .append(escCsv(trace.judgment()))
               .append('\n');
        }
        return csv.toString().getBytes(StandardCharsets.UTF_8);
    }

    private static int wordCount(String contentTex) {
        if (contentTex == null || contentTex.isBlank()) return 0;
        return contentTex.trim().split("\\s+").length;
    }

    private static String escCsv(String s) {
        if (s == null) return "";
        if (s.contains(",") || s.contains("\"") || s.contains("\n")) {
            return "\"" + s.replace("\"", "\"\"") + "\"";
        }
        return s;
    }

    private String missingIfBlank(String value) {
        return value == null || value.isBlank() ? MISSING : value;
    }
}
