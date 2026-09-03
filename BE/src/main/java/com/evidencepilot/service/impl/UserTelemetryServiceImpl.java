package com.evidencepilot.service.impl;

import com.evidencepilot.dto.response.UserTelemetryResponse;
import com.evidencepilot.exception.ResourceNotFoundException;
import com.evidencepilot.model.FeedbackStatus;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.ProjectMember;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.ProjectStatus;
import com.evidencepilot.model.enums.TraceOutcome;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.EvidenceRevisionTraceRepository;
import com.evidencepilot.repository.FeedbackRequestRepository;
import com.evidencepilot.repository.ProjectMemberRepository;
import com.evidencepilot.repository.UserRepository;
import com.evidencepilot.service.UserTelemetryService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class UserTelemetryServiceImpl implements UserTelemetryService {

    private final UserRepository userRepository;
    private final ProjectMemberRepository projectMemberRepository;
    private final FeedbackRequestRepository feedbackRequestRepository;
    private final EvidenceRevisionTraceRepository evidenceRevisionTraceRepository;

    private static final Set<ProjectStatus> ACTIVE_STUDENT_STATUSES = Set.of(
            ProjectStatus.CREATED,
            ProjectStatus.ASSIGNED,
            ProjectStatus.IN_PROGRESS,
            ProjectStatus.SUBMITTED_FOR_REVIEW,
            ProjectStatus.RETURNED
    );

    @Override
    @Transactional(readOnly = true)
    public UserTelemetryResponse getMyTelemetry(UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException(userId, "User"));

        Map<String, Object> metrics = new LinkedHashMap<>();
        List<UserTelemetryResponse.MilestoneItem> milestones = new ArrayList<>();

        if (user.getRole() == UserRole.INSTRUCTOR) {
            List<ProjectMember> memberships = projectMemberRepository.findByUserId(userId);
            long guidedProjectsCount = memberships.stream()
                    .map(ProjectMember::getProject)
                    .filter(Objects::nonNull)
                    .filter(Project::isActive)
                    .map(Project::getId)
                    .distinct()
                    .count();

            long pendingFeedbackRequests = feedbackRequestRepository
                    .countByInstructorIdAndStatus(userId, FeedbackStatus.PENDING);

            metrics.put("guidedProjectsCount", guidedProjectsCount);
            metrics.put("pendingFeedbackRequests", pendingFeedbackRequests);

            milestones.add(new UserTelemetryResponse.MilestoneItem(
                    "instructor-init",
                    "INSTRUCTOR_ACTIVE",
                    "Instructor Profile Active",
                    "Guiding " + guidedProjectsCount + " academic project workspaces",
                    LocalDateTime.now()
            ));
        } else {
            // Student or Admin
            List<ProjectMember> memberships = projectMemberRepository.findByUserId(userId);
            List<Project> studentProjects = memberships.stream()
                    .map(ProjectMember::getProject)
                    .filter(Objects::nonNull)
                    .filter(Project::isActive)
                    .distinct()
                    .toList();

            long activeProjectsCount = studentProjects.stream()
                    .filter(p -> ACTIVE_STUDENT_STATUSES.contains(p.getStatus()))
                    .count();

            long pendingRevisionTraces = 0;
            for (Project project : studentProjects) {
                pendingRevisionTraces += evidenceRevisionTraceRepository.findByProjectIdOrderByCreatedAtDesc(project.getId())
                        .stream()
                        .filter(t -> t.getStudentAction() == null || t.getOutcome() == TraceOutcome.UNRESOLVED)
                        .count();
            }

            metrics.put("activeProjectsCount", activeProjectsCount);
            metrics.put("pendingRevisionTraces", pendingRevisionTraces);

            milestones.add(new UserTelemetryResponse.MilestoneItem(
                    "student-init",
                    "STUDENT_ACTIVE",
                    "Student Workspace Ready",
                    "Participating in " + activeProjectsCount + " active project workspaces",
                    LocalDateTime.now()
            ));
        }

        return new UserTelemetryResponse(user.getRole(), metrics, milestones);
    }
}
