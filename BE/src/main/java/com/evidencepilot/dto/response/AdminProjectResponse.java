package com.evidencepilot.dto.response;

import com.evidencepilot.model.Document;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.PaperStandard;
import com.evidencepilot.model.enums.ProcessingStatus;
import com.evidencepilot.model.enums.ProjectStatus;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public record AdminProjectResponse(
        UUID id,
        String title,
        String description,
        ProjectStatus status,
        PaperStandard targetStandard,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        String instructorName,
        int collaboratorCount,
        int papersProcessed,
        int totalSources,
        int completionRate) {

    public static AdminProjectResponse from(Project project) {
        List<Document> docs = project.getProjectDocuments() == null ? List.of() : project.getProjectDocuments();
        int totalPapers = (int) docs.stream().filter(d -> d.getDocType() == DocumentType.PAPER).count();
        int processed = (int) docs.stream()
                .filter(d -> d.getDocType() == DocumentType.PAPER)
                .filter(d -> d.getProcessingStatus() == ProcessingStatus.COMPLETED
                        || d.getProcessingStatus() == ProcessingStatus.READY)
                .count();
        int totalSources = (int) docs.stream().filter(d -> d.getDocType() == DocumentType.SOURCE).count();
        int completionRate = totalPapers > 0 ? (int) Math.round(processed * 100.0 / totalPapers) : 0;
        return new AdminProjectResponse(
                project.getId(),
                project.getTitle(),
                project.getDescription(),
                project.getStatus(),
                project.getTargetStandard(),
                project.getCreatedAt(),
                project.getUpdatedAt(),
                project.getInstructor() != null ? project.getInstructor().getEmail() : null,
                project.getProjectMembers() == null ? 0 : project.getProjectMembers().size(),
                processed,
                totalSources,
                completionRate);
    }
}
