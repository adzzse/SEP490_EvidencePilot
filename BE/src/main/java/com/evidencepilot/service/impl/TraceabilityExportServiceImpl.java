package com.evidencepilot.service.impl;

import com.evidencepilot.dto.response.TraceabilityExportResponse;
import com.evidencepilot.dto.response.FeedbackReplyResponseDto;
import com.evidencepilot.dto.response.ProjectSourceMapResponse;
import com.evidencepilot.exception.ResourceNotFoundException;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.DocumentReference;
import com.evidencepilot.model.EvidenceRevisionTrace;
import com.evidencepilot.model.InstructorFeedback;
import com.evidencepilot.model.FeedbackAttachment;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.ProjectDocument;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.AccountStatus;
import com.evidencepilot.model.enums.ProjectRole;
import com.evidencepilot.model.enums.PaperSectionType;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.DocumentReferenceRepository;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.EvidenceRevisionTraceRepository;
import com.evidencepilot.repository.FeedbackRequestRepository;
import com.evidencepilot.repository.InstructorFeedbackRepository;
import com.evidencepilot.repository.FeedbackAttachmentRepository;
import com.evidencepilot.repository.PaperSectionRepository;
import com.evidencepilot.repository.ProjectDocumentRepository;
import com.evidencepilot.repository.ProjectRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import com.evidencepilot.service.DocumentObjectStorage;

@Service
@RequiredArgsConstructor
public class TraceabilityExportServiceImpl {

    private final ProjectRepository projectRepository;
    private final DocumentRepository documentRepository;
    private final DocumentReferenceRepository documentReferenceRepository;
    private final FeedbackRequestRepository feedbackRequestRepository;
    private final InstructorFeedbackRepository instructorFeedbackRepository;
    private final FeedbackAttachmentRepository feedbackAttachmentRepository;
    private final DocumentObjectStorage objectStorage;
    private final ProjectDocumentRepository projectDocumentRepository;
    private final PaperSectionRepository paperSectionRepository;
    private final EvidenceRevisionTraceRepository evidenceRevisionTraceRepository;
    private final CurrentUserServiceImpl currentUserService;
    private final ProjectSourceMapService projectSourceMapService;
    private final ProgressReportServiceImpl progressReportService;

    @Transactional(readOnly = true)
    public TraceabilityExportResponse exportTraceability(UUID projectId) {
        User currentUser = currentUserService.requireCurrentUser();
        Project project = requireProject(projectId);
        currentUserService.requireProjectAccess(currentUser, project);
        return buildData(project, currentUser);
    }

    @Transactional(readOnly = true)
    public TraceabilityExportResponse buildDataForArchive(UUID projectId, User viewer) {
        Project project = requireProject(projectId);
        currentUserService.requireProjectAccess(viewer, project);
        return buildData(project, viewer);
    }

    private Project requireProject(UUID projectId) {
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new ResourceNotFoundException(projectId, "Project"));
        if (!project.isActive()) throw new ResourceNotFoundException(projectId, "Project");
        return project;
    }

    private TraceabilityExportResponse buildData(Project project, User viewer) {
        UUID projectId = project.getId();

        List<Document> activeSources = new ArrayList<>();
        documentRepository.findByProjectIdAndDocTypeAndActiveTrue(projectId, DocumentType.SOURCE)
                .forEach(activeSources::add);
        projectDocumentRepository.findByProjectId(projectId).stream()
                .map(ProjectDocument::getDocument)
                .filter(doc -> doc.isActive() && doc.getDocType() == DocumentType.SOURCE)
                .filter(doc -> activeSources.stream().noneMatch(d -> d.getId().equals(doc.getId())))
                .forEach(activeSources::add);

        List<DocumentReference> references = activeSources.isEmpty() ? List.of()
                : documentReferenceRepository.findForDocuments(activeSources.stream().map(Document::getId).toList());
        Map<UUID, Long> referenceCountBySource = references.stream().collect(Collectors.groupingBy(
                reference -> reference.getDocument().getId(), Collectors.counting()));

        List<TraceabilityExportResponse.TraceabilitySource> sources = activeSources.stream()
                .map(source -> new TraceabilityExportResponse.TraceabilitySource(
                        source.getId(),
                        source.getTitle(),
                        source.getAuthors(),
                        source.getPublicationYear(),
                        source.getDoi(),
                        source.getPublisher(),
                        source.getOriginalFilename(),
                        source.getFileSizeBytes(),
                        referenceCountBySource.getOrDefault(source.getId(), 0L).intValue(),
                        source.getCitedByCount(),
                        source.getOpenAlexTopic(),
                        source.getOpenAlexSubfield(),
                        source.getOpenAlexField(),
                        source.getOpenAlexDomain(),
                        source.getProcessingStatus() == null ? null : source.getProcessingStatus().name()))
                .toList();
        List<TraceabilityExportResponse.TraceabilitySourceReference> sourceReferences = references.stream()
                .map(reference -> new TraceabilityExportResponse.TraceabilitySourceReference(
                        reference.getId(), reference.getDocument().getId(), reference.getReferenceIndex(),
                        reference.getEdgeType() == null ? null : reference.getEdgeType().name(),
                        reference.getTitle(), reference.getDoi(), reference.getPublicationYear(),
                        reference.getRawText()))
                .toList();

        List<TraceabilityExportResponse.TraceabilityPaper> papers = new ArrayList<>();
        List<TraceabilityExportResponse.TraceabilitySection> sections = new ArrayList<>();
        for (Document paper : documentRepository
                .findByProjectIdAndDocTypeAndActiveTrue(projectId, DocumentType.PAPER)) {
            papers.add(new TraceabilityExportResponse.TraceabilityPaper(paper.getId(),
                    paper.getTitle() == null || paper.getTitle().isBlank()
                            ? paper.getOriginalFilename() : paper.getTitle()));
            for (PaperSection section : paperSectionRepository
                    .findByDocumentIdOrderBySectionOrderAsc(paper.getId())) {
                if (!section.isActive()) continue;
                sections.add(new TraceabilityExportResponse.TraceabilitySection(
                        section.getId(),
                        paper.getId(),
                        section.getSectionTitle(),
                        section.getSectionOrder(),
                        wordCount(section.getContentTex()),
                        section.getVersion() != null ? section.getVersion() : 1,
                        section.getAssignedUser() == null ? null : section.getAssignedUser().getId(),
                        section.getUpdatedAt(),
                        section.getContentTex()));
            }
        }

        List<TraceabilityExportResponse.TraceabilityFeedback> feedback = feedbackRequestRepository
                .findByProjectIdOrderByRequestedAtDesc(projectId)
                .stream()
                .map(request -> new TraceabilityExportResponse.TraceabilityFeedback(
                        request.getId(),
                        request.getStudent() == null ? null : request.getStudent().getId(),
                        request.getInstructor() == null ? null : request.getInstructor().getId(),
                        request.getStatus(),
                        request.getRequestedAt(),
                        request.getReviewedAt()))
                .toList();

        List<InstructorFeedback> publishedComments = instructorFeedbackRepository
                .findByRequestProjectId(projectId).stream()
                .filter(comment -> comment.getPublishedAt() != null)
                .filter(comment -> canReadFeedback(viewer, project, comment))
                .toList();
        List<TraceabilityExportResponse.TraceabilityComment> feedbackComments = publishedComments.stream()
                .map(comment -> new TraceabilityExportResponse.TraceabilityComment(
                        comment.getId(), comment.getRequest().getId(), comment.getSection().getId(),
                        comment.getContent(), comment.getThreadState().name(),
                        comment.getStudentNote(), comment.getPublishedAt()))
                .toList();
        List<FeedbackReplyResponseDto> feedbackReplies = publishedComments.stream()
                .flatMap(comment -> comment.getReplies().stream())
                .filter(reply -> reply.getPublishedAt() != null)
                .map(FeedbackReplyResponseDto::from)
                .toList();
        List<TraceabilityExportResponse.TraceabilityAttachment> feedbackAttachments = publishedAttachments(project, viewer)
                .stream()
                .map(attachment -> new TraceabilityExportResponse.TraceabilityAttachment(
                        attachment.getId(), attachment.getFeedback().getId(),
                        attachment.getReply() == null ? null : attachment.getReply().getId(),
                        attachment.getMimeType(), attachment.getFileSizeBytes(),
                        attachmentPath(attachment), attachment.getCreatedAt()))
                .toList();

        List<TraceabilityExportResponse.TraceabilityTrace> traces = evidenceRevisionTraceRepository
                .findByProjectIdOrderByCreatedAtDesc(projectId)
                .stream()
                .filter(trace -> canReadSection(viewer, project, trace.getSection()))
                .map(this::toTrace)
                .toList();

        ProjectSourceMapResponse map = projectSourceMapService.buildMap(project);

        return new TraceabilityExportResponse(
                project.getId(),
                project.getTitle(),
                project.getDescription(),
                project.getStatus(),
                project.getTargetStandard(),
                Instant.now(),
                papers,
                sections,
                sources,
                sourceReferences,
                map.nodes().stream().filter(node -> "REFERENCE".equals(node.type())).toList(),
                map.edges().stream().filter(edge -> "CITES".equals(edge.type())).toList(),
                feedback,
                feedbackComments,
                feedbackReplies,
                feedbackAttachments,
                traces,
                progressReportService.buildReport(projectId, "ALL", null, null).contributions());
    }

    private TraceabilityExportResponse.TraceabilityTrace toTrace(EvidenceRevisionTrace trace) {
        return new TraceabilityExportResponse.TraceabilityTrace(
                trace.getId(),
                trace.getRound() == null ? null : trace.getRound().getId(),
                trace.getSection().getId(),
                trace.getSection().getSectionTitle(),
                trace.getFindingIndex(),
                trace.getSuggestedAction(),
                trace.getExcerpt(),
                trace.getRationale(),
                trace.getSource() == null ? null : trace.getSource().getId(),
                trace.getSource() == null ? null : trace.getSource().getTitle(),
                trace.getEvidenceQuote(),
                trace.getEvidenceRelation(),
                trace.getStudentAction() == null ? null : trace.getStudentAction().name(),
                trace.getExplanation(),
                trace.getOutcome() == null ? null : trace.getOutcome().name(),
                trace.getJudgment() == null ? null : trace.getJudgment().name(),
                trace.getInstructorFeedback(),
                trace.getCreatedAt());
    }

    @Transactional(readOnly = true)
    public Path exportTraceabilityCsv(UUID projectId) {
        User viewer = currentUserService.requireCurrentUser();
        Project project = requireProject(projectId);
        currentUserService.requireProjectAccess(viewer, project);
        TraceabilityExportResponse data = buildData(project, viewer);
        Path archive = null;
        try {
            archive = Files.createTempFile("project-data-csv-", ".zip");
            writeCsvArchive(projectId, viewer, data, archive);
            return archive;
        } catch (IOException | RuntimeException exception) {
            if (archive != null) {
                try { Files.deleteIfExists(archive); } catch (IOException cleanupFailure) { exception.addSuppressed(cleanupFailure); }
            }
            throw new IllegalStateException("Failed to create CSV archive", exception);
        }
    }

    @Transactional(readOnly = true)
    public void writeCsvArchiveForJob(UUID projectId, User viewer, Path destination) throws IOException {
        writeCsvArchive(projectId, viewer, buildDataForArchive(projectId, viewer), destination);
    }

    private void writeCsvArchive(UUID projectId, User viewer, TraceabilityExportResponse data, Path destination) throws IOException {
        try (ZipOutputStream zip = new ZipOutputStream(Files.newOutputStream(destination), StandardCharsets.UTF_8)) {
            ProjectCsvArchive.writeEntries(data, zip, "");
            writeFeedbackAttachments(projectId, viewer, zip);
        }
    }

    @Transactional(readOnly = true)
    public void writeFeedbackAttachments(UUID projectId, User viewer, ZipOutputStream zip) throws IOException {
        Project project = requireProject(projectId);
        currentUserService.requireProjectAccess(viewer, project);
        for (FeedbackAttachment attachment : publishedAttachments(project, viewer)) {
            zip.putNextEntry(new ZipEntry(attachmentPath(attachment)));
            try (InputStream content = objectStorage.getStream(attachment.getStorageKey())) {
                content.transferTo(zip);
            }
            zip.closeEntry();
        }
    }

    private List<FeedbackAttachment> publishedAttachments(Project project, User viewer) {
        return feedbackAttachmentRepository.findByProjectId(project.getId()).stream()
                .filter(attachment -> attachment.getFeedback() != null
                        && attachment.getFeedback().getPublishedAt() != null)
                .filter(attachment -> canReadFeedback(viewer, project, attachment.getFeedback()))
                .filter(attachment -> attachment.getReply() == null
                        || attachment.getReply().getPublishedAt() != null)
                .toList();
    }

    private boolean canReadFeedback(User viewer, Project project, InstructorFeedback feedback) {
        if (viewer.getRole() == UserRole.ADMIN) return true;
        if (viewer.getRole() == UserRole.INSTRUCTOR) {
            return sameUser(project.getInstructor(), viewer)
                    || (feedback.getRequest() != null && sameUser(feedback.getRequest().getInstructor(), viewer));
        }
        if (viewer.getRole() != UserRole.STUDENT || viewer.getAccountStatus() != AccountStatus.ACTIVE
                || project.getProjectMembers() == null) return false;
        boolean leader = project.getProjectMembers().stream().anyMatch(member ->
                member.getRole() == ProjectRole.LEADER && sameUser(member.getUser(), viewer));
        if (leader) return true;
        return project.getProjectMembers().stream().anyMatch(member ->
                member.getRole() == ProjectRole.MEMBER && sameUser(member.getUser(), viewer))
                && feedback.getSection() != null
                && sameUser(feedback.getSection().getAssignedUser(), viewer);
    }

    private boolean canReadSection(User viewer, Project project, PaperSection section) {
        if (section == null) return false;
        if (viewer.getRole() == UserRole.ADMIN || viewer.getRole() == UserRole.INSTRUCTOR) return true;
        if (!section.isActive()) return false;
        if (viewer.getRole() != UserRole.STUDENT || viewer.getAccountStatus() != AccountStatus.ACTIVE
                || project.getProjectMembers() == null) return false;
        boolean member = project.getProjectMembers().stream().anyMatch(item ->
                (item.getRole() == ProjectRole.LEADER || item.getRole() == ProjectRole.MEMBER)
                        && sameUser(item.getUser(), viewer));
        return member && (section.getSectionType() == PaperSectionType.REFERENCE
                || sameUser(section.getAssignedUser(), viewer));
    }

    private static boolean sameUser(User left, User right) {
        return left != null && right != null && left.getId() != null && left.getId().equals(right.getId());
    }

    private static String attachmentPath(FeedbackAttachment attachment) {
        String extension = switch (attachment.getMimeType()) {
            case "image/png" -> "png";
            case "image/jpeg" -> "jpg";
            case "image/gif" -> "gif";
            case "image/webp" -> "webp";
            default -> "bin";
        };
        return "data/feedback-attachments/" + attachment.getId() + "." + extension;
    }

    private static int wordCount(String contentTex) {
        if (contentTex == null || contentTex.isBlank()) return 0;
        return contentTex.trim().split("\\s+").length;
    }

}
