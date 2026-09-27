package com.evidencepilot.service;

import com.evidencepilot.dto.request.SubmitReviewRequest;
import com.evidencepilot.dto.response.FeedbackRequestResponseDto;
import com.evidencepilot.dto.response.ReviewReadinessResponse;
import com.evidencepilot.exception.ResourceNotFoundException;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.FeedbackRequest;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.ProjectMember;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.AccountStatus;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.PaperSectionType;
import com.evidencepilot.model.enums.ProcessingStatus;
import com.evidencepilot.model.enums.ProjectRole;
import com.evidencepilot.model.enums.ProjectStatus;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.PaperSectionRepository;
import com.evidencepilot.repository.ProjectMemberRepository;
import com.evidencepilot.repository.ProjectRepository;
import com.evidencepilot.service.impl.FeedbackServiceImpl;
import com.evidencepilot.service.impl.PaperProcessingServiceImpl;
import com.evidencepilot.service.impl.ProjectServiceImpl;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;

@Service
@RequiredArgsConstructor
public class SeedProjectLifecycle {

    private final ProjectRepository projectRepository;
    private final ProjectMemberRepository projectMemberRepository;
    private final DocumentRepository documentRepository;
    private final PaperSectionRepository paperSectionRepository;
    private final PaperProcessingServiceImpl paperProcessingService;
    private final SubmissionReadinessService submissionReadinessService;
    private final FeedbackServiceImpl feedbackService;
    private final ProjectServiceImpl projectService;
    private final AuditService auditService;

    @Transactional
    public void apply(UUID projectId, ProjectStatus target, User seedAdmin) {
        if (target != ProjectStatus.SUBMITTED_FOR_REVIEW
                && target != ProjectStatus.APPROVED
                && target != ProjectStatus.ARCHIVED) {
            throw new IllegalArgumentException("Unsupported v2 review target: " + target);
        }
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new ResourceNotFoundException(projectId, "Project"));
        ProjectStatus initialStatus = project.getStatus();
        User instructor = requiredMember(projectId, ProjectRole.INSTRUCTOR, UserRole.INSTRUCTOR);
        User leader = requiredMember(projectId, ProjectRole.LEADER, UserRole.STUDENT);
        Document paper = requiredPaper(projectId);
        List<PaperSection> sections = paperSectionRepository
                .findByDocumentIdOrderBySectionOrderAsc(paper.getId()).stream()
                .filter(PaperSection::isActive)
                .toList();
        if (sections.isEmpty()) throw new IllegalStateException("paper has no active extracted sections");
        if (sections.stream().anyMatch(section -> section.getContentTex() == null
                || section.getContentTex().isBlank())) {
            throw new IllegalStateException("paper contains a blank active section");
        }

        for (PaperSection section : sections) {
            if (section.getSectionType() == PaperSectionType.REFERENCE) continue;
            as(instructor, () -> {
                paperProcessingService.assignSection(paper.getId(), section.getId(), leader.getId());
                return null;
            });
        }

        FeedbackRequestResponseDto request = as(leader, () -> {
            ReviewReadinessResponse before = submissionReadinessService.readiness(projectId);
            for (ReviewReadinessResponse.Paper readyPaper : before.papers()) {
                for (ReviewReadinessResponse.Section readySection : readyPaper.sections()) {
                    if (readySection.sectionType() != PaperSectionType.REFERENCE) {
                        submissionReadinessService.confirm(
                                readyPaper.id(), readySection.id(), readySection.currentInputFingerprint());
                    }
                }
            }
            ReviewReadinessResponse finalReadiness = submissionReadinessService.readiness(projectId);
            if (!"READY".equals(finalReadiness.state()) || !finalReadiness.canSubmit()) {
                throw new IllegalStateException("seed review readiness failed: " + finalReadiness.checks());
            }
            return feedbackService.submitForReview(
                    projectId, new SubmitReviewRequest(finalReadiness.submissionFingerprint()));
        });

        if (target == ProjectStatus.APPROVED || target == ProjectStatus.ARCHIVED) {
            as(instructor, () -> {
                feedbackService.updateStatus(request.id(), "REVIEWED");
                return null;
            });
        }
        if (target == ProjectStatus.ARCHIVED) {
            as(seedAdmin, () -> {
                projectService.archiveProject(projectId);
                return null;
            });
        }
        auditService.record("SEED_REVIEW_STATE_APPLIED", "PROJECT", projectId, seedAdmin,
                initialStatus, Map.of("targetStatus", target.name(), "feedbackRequestId", request.id().toString(),
                        "appliedAt", LocalDateTime.now().toString()));
    }

    private User requiredMember(UUID projectId, ProjectRole role, UserRole userRole) {
        return projectMemberRepository.findByProjectId(projectId).stream()
                .filter(member -> member.getRole() == role)
                .map(ProjectMember::getUser)
                .filter(user -> user != null && user.getRole() == userRole
                        && user.getAccountStatus() == AccountStatus.ACTIVE)
                .findFirst()
                .orElseThrow(() -> new IllegalStateException(
                        "project requires one ACTIVE " + role + " " + userRole));
    }

    private Document requiredPaper(UUID projectId) {
        List<Document> papers = documentRepository
                .findByProjectIdAndDocTypeAndActiveTrue(projectId, DocumentType.PAPER);
        if (papers.size() != 1) throw new IllegalStateException("review project must have exactly one paper");
        Document paper = papers.getFirst();
        if (paper.getProcessingStatus() != ProcessingStatus.READY
                && paper.getProcessingStatus() != ProcessingStatus.COMPLETED) {
            throw new IllegalStateException("paper is not READY: " + paper.getProcessingStatus());
        }
        return paper;
    }

    private <T> T as(User actor, Supplier<T> action) {
        Authentication previous = SecurityContextHolder.getContext().getAuthentication();
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(actor, null, List.of()));
        try {
            return action.get();
        } finally {
            SecurityContextHolder.getContext().setAuthentication(previous);
        }
    }
}
