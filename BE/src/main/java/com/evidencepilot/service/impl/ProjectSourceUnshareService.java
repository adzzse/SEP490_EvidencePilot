package com.evidencepilot.service.impl;

import com.evidencepilot.dto.response.ProjectSourceUnshareResponse;
import com.evidencepilot.exception.ResourceNotFoundException;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.ProjectDocument;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.ProcessingStatus;
import com.evidencepilot.model.enums.ProjectStatus;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.EvidenceRevisionTraceRepository;
import com.evidencepilot.repository.PaperReferenceRepository;
import com.evidencepilot.repository.ProjectDocumentRepository;
import com.evidencepilot.repository.ProjectRepository;
import com.evidencepilot.service.AuditService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ProjectSourceUnshareService {

    private static final Set<ProcessingStatus> SAFE_EXTRACTION_STATUSES = Set.of(
            ProcessingStatus.READY, ProcessingStatus.COMPLETED);
    private static final Set<ProjectStatus> CORPUS_LOCKED_STATUSES = Set.of(
            ProjectStatus.SUBMITTED_FOR_REVIEW,
            ProjectStatus.APPROVED,
            ProjectStatus.ARCHIVED);

    private final ProjectRepository projectRepository;
    private final ProjectDocumentRepository projectDocumentRepository;
    private final DocumentRepository documentRepository;
    private final PaperReferenceRepository paperReferenceRepository;
    private final EvidenceRevisionTraceRepository evidenceRevisionTraceRepository;
    private final CurrentUserServiceImpl currentUserService;
    private final AuditService auditService;

    @Transactional
    public ProjectSourceUnshareResponse unshare(UUID projectId, List<UUID> requestedSourceIds) {
        List<UUID> sourceIds = normalize(requestedSourceIds);
        if (sourceIds.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "At least one source is required");
        }

        User currentUser = currentUserService.requireCurrentUser();
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new ResourceNotFoundException(projectId, "Project"));
        requireProjectWriteAccess(currentUser, project);
        if (CORPUS_LOCKED_STATUSES.contains(project.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Project corpus is locked and cannot be modified.");
        }

        List<Candidate> candidates = new ArrayList<>();
        List<ProjectSourceUnshareResponse.BlockedSource> blocked = new ArrayList<>();
        for (UUID sourceId : sourceIds) {
            ProjectDocument link = projectDocumentRepository
                    .findByProjectIdAndDocumentId(projectId, sourceId)
                    .orElse(null);
            Document source = link == null
                    ? documentRepository.findById(sourceId).orElse(null)
                    : link.getDocument();
            boolean directOwnership = link == null;

            String relationshipBlock = relationshipBlock(projectId, source, directOwnership);
            if (relationshipBlock != null) {
                blocked.add(blocked(sourceId, relationshipBlock));
                continue;
            }

            String safetyBlock = safetyBlock(projectId, source);
            if (safetyBlock != null) {
                blocked.add(blocked(sourceId, safetyBlock));
                continue;
            }
            candidates.add(new Candidate(sourceId, source, link, directOwnership));
        }

        // Validate every requested source before mutating any association.
        if (!blocked.isEmpty()) {
            return new ProjectSourceUnshareResponse(List.of(), List.copyOf(blocked));
        }

        List<UUID> removed = new ArrayList<>();
        for (Candidate candidate : candidates) {
            if (candidate.directOwnership()) {
                candidate.source().setProject(null);
                documentRepository.save(candidate.source());
            } else {
                projectDocumentRepository.delete(candidate.link());
            }
            removed.add(candidate.sourceId());
        }
        auditService.record("PROJECT_SOURCES_UNSHARED", "PROJECT", projectId, currentUser,
                null, removed);
        return new ProjectSourceUnshareResponse(List.copyOf(removed), List.of());
    }

    private void requireProjectWriteAccess(User currentUser, Project project) {
        if (currentUserService.isInstructor(currentUser) || currentUserService.isAdmin(currentUser)) {
            currentUserService.requireProjectAccess(currentUser, project);
        } else {
            currentUserService.requireProjectWriteAccess(currentUser, project);
        }
    }

    private String relationshipBlock(UUID projectId, Document source, boolean directOwnership) {
        if (source == null || source.getDocType() != DocumentType.SOURCE || !source.isActive()) {
            return "NOT_SHARED_WITH_PROJECT";
        }
        if (directOwnership && (source.getProject() == null
                || !projectId.equals(source.getProject().getId()))) {
            return "NOT_SHARED_WITH_PROJECT";
        }
        return null;
    }

    private String safetyBlock(UUID projectId, Document source) {
        if (!SAFE_EXTRACTION_STATUSES.contains(source.getProcessingStatus())) {
            return "SOURCE_NOT_READY";
        }
        if (paperReferenceRepository.existsActiveForProject(projectId, source.getId())) {
            return "PAPER_REFERENCE";
        }
        if (evidenceRevisionTraceRepository.existsActiveForProjectAndSource(projectId, source.getId())) {
            return "EVIDENCE_REVIEW";
        }
        return null;
    }

    private ProjectSourceUnshareResponse.BlockedSource blocked(UUID sourceId, String reason) {
        return new ProjectSourceUnshareResponse.BlockedSource(sourceId, reason, 1);
    }

    private List<UUID> normalize(List<UUID> sourceIds) {
        if (sourceIds == null) {
            return List.of();
        }
        return new ArrayList<>(new LinkedHashSet<>(sourceIds.stream()
                .filter(id -> id != null)
                .toList()));
    }

    private record Candidate(UUID sourceId, Document source, ProjectDocument link, boolean directOwnership) {
    }
}
