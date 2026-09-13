package com.evidencepilot.service.impl;

import com.evidencepilot.dto.response.PaperReferenceResponse;
import com.evidencepilot.exception.ResourceNotFoundException;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.PaperReference;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.ProcessingStatus;
import com.evidencepilot.model.enums.ProjectRole;
import com.evidencepilot.model.enums.ProjectStatus;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.PaperReferenceRepository;
import com.evidencepilot.repository.PaperSectionRepository;
import com.evidencepilot.repository.ProjectDocumentRepository;
import com.evidencepilot.repository.ProjectMemberRepository;
import com.evidencepilot.repository.UserRepository;
import com.evidencepilot.service.CurrentUserService;
import com.evidencepilot.service.CitationBibliography;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class PaperReferenceService {

    private final DocumentRepository documentRepository;
    private final PaperReferenceRepository paperReferenceRepository;
    private final PaperSectionRepository paperSectionRepository;
    private final ProjectDocumentRepository projectDocumentRepository;
    private final ProjectMemberRepository projectMemberRepository;
    private final SourceMatchingService sourceMatchingService;
    private final UserRepository userRepository;
    private final CurrentUserService currentUserService;

    @Transactional(readOnly = true)
    public List<PaperReferenceResponse> list(UUID paperId, UUID requesterId) {
        User requester = requireUser(requesterId);
        Document paper = requirePaper(paperId);
        currentUserService.requireProjectAccess(requester, paper.getProject());
        return paperReferenceRepository.findByPaperIdOrderByAddedAtAsc(paperId).stream()
                .filter(reference -> reference.getSource() != null
                        && reference.getSource().isActive()
                        && reference.getSource().getDocType() == DocumentType.SOURCE)
                .map(reference -> response(reference, requester, paper.getProject()))
                .toList();
    }

    @Transactional
    public PaperReferenceResponse add(UUID paperId, UUID sourceId, UUID requesterId) {
        // Lock before the first consistent read: duplicate adds see the committed link.
        Document paper = documentRepository.findByIdForUpdate(paperId)
                .orElseThrow(() -> new ResourceNotFoundException(paperId, "Paper"));
        validatePaper(paper);
        User requester = requireUser(requesterId);
        requireStudentWriter(requester, paper.getProject());
        Document source = requireVisibleSource(paper.getProject(), sourceId);
        return paperReferenceRepository.findByPaperIdAndSourceId(paperId, sourceId)
                .map(reference -> response(reference, requester, paper.getProject()))
                .orElseGet(() -> {
                    PaperReference reference = new PaperReference();
                    reference.setPaper(paper);
                    reference.setSource(source);
                    reference.setAddedBy(requester);
                    reference.setAddedAt(LocalDateTime.now());
                    return response(paperReferenceRepository.save(reference), requester, paper.getProject());
                });
    }

    @Transactional
    public void remove(UUID paperId, UUID sourceId, UUID requesterId) {
        User requester = requireUser(requesterId);
        Document paper = requirePaper(paperId);
        requireStudentWriter(requester, paper.getProject());
        PaperReference reference = paperReferenceRepository.findByPaperIdAndSourceId(paperId, sourceId)
                .orElseThrow(() -> new ResourceNotFoundException(sourceId, "PaperReference"));
        String citationKey = SourceMatchingService.citationKey(sourceId);
        boolean cited = CitationBibliography.citationKeys(
                paperSectionRepository.findByDocumentIdOrderBySectionOrderAsc(paperId)).contains(citationKey);
        if (cited) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "REFERENCE_IN_USE: remove \\cite{" + citationKey + "} from the paper before removing this reference");
        }
        paperReferenceRepository.delete(reference);
    }

    @Transactional(readOnly = true)
    public List<Document> referenceSources(UUID paperId) {
        Document paper = requirePaper(paperId);
        return sourceMatchingService.referenceSources(paper.getId());
    }

    @Transactional(readOnly = true)
    public List<Document> retrievableReferenceSources(UUID paperId) {
        Document paper = requirePaper(paperId);
        return sourceMatchingService.retrievableReferenceSources(paper.getId());
    }

    private User requireUser(UUID requesterId) {
        return userRepository.findById(requesterId)
                .orElseThrow(() -> new ResourceNotFoundException(requesterId, "User"));
    }

    private Document requirePaper(UUID paperId) {
        Document paper = documentRepository.findById(paperId)
                .orElseThrow(() -> new ResourceNotFoundException(paperId, "Paper"));
        validatePaper(paper);
        return paper;
    }

    private void validatePaper(Document paper) {
        if (!paper.isActive() || paper.getDocType() != DocumentType.PAPER || paper.getProject() == null) {
            throw new ResourceNotFoundException(paper.getId(), "Paper");
        }
    }

    private PaperReferenceResponse response(PaperReference reference, User requester, Project project) {
        Document source = reference.getSource();
        boolean canAttach = false;
        if (source.getProcessingStatus() == ProcessingStatus.METADATA_FETCHED) {
            try {
                requireStudentWriter(requester, project);
                boolean direct = source.getProject() != null && project.getId().equals(source.getProject().getId());
                boolean personalOwner = source.getProject() == null && source.getCollection() == null
                        && source.getUploadedBy() != null && requester.getId().equals(source.getUploadedBy().getId());
                canAttach = direct || personalOwner || currentUserService.isAdmin(requester);
                if (canAttach) {
                    canAttach = projectDocumentRepository.findByDocumentId(source.getId()).stream()
                            .noneMatch(link -> link.getProject().getStatus().isReadOnly()
                                    || link.getProject().getStatus() == ProjectStatus.SUBMITTED_FOR_REVIEW);
                }
            } catch (ResponseStatusException denied) {
                canAttach = false;
            }
        }
        return PaperReferenceResponse.from(reference, canAttach);
    }

    private void requireStudentWriter(User requester, Project project) {
        if (project.getStatus().isReadOnly()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Project is read-only.");
        }
        if (project.getStatus() == ProjectStatus.SUBMITTED_FOR_REVIEW) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Project is locked and cannot be modified.");
        }
        if (currentUserService.isAdmin(requester)) {
            return;
        }
        boolean writer = requester.getRole() == UserRole.STUDENT
                && projectMemberRepository.findByProjectIdAndUserId(project.getId(), requester.getId()).stream()
                        .anyMatch(member -> member.getRole() == ProjectRole.LEADER
                                || member.getRole() == ProjectRole.MEMBER);
        if (!writer) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Write access denied to project");
        }
    }

    private Document requireVisibleSource(Project project, UUID sourceId) {
        Document source = documentRepository.findById(sourceId)
                .orElseThrow(() -> new ResourceNotFoundException(sourceId, "Source"));
        if (!source.isActive() || source.getDocType() != DocumentType.SOURCE) {
            throw new ResourceNotFoundException(sourceId, "Source");
        }
        boolean direct = source.getProject() != null && project.getId().equals(source.getProject().getId());
        boolean shared = projectDocumentRepository
                .findByProjectIdAndDocumentId(project.getId(), sourceId).isPresent();
        if (!direct && !shared) {
            throw new ResourceNotFoundException(sourceId, "Source");
        }
        return source;
    }
}
