package com.evidencepilot.dto.response;

import com.evidencepilot.model.PaperSection;
import com.evidencepilot.model.User;

import java.time.LocalDateTime;
import java.util.UUID;

public record PaperSectionResponse(
        UUID id,
        UUID documentId,
        UUID assignedUserId,
        String assignedUserName,
        Integer sectionOrder,
        String sectionTitle,
        String contentTex,
        String previousContentTex,
        Integer version,
        Long revision,
        String contentMdCache,
        LocalDateTime updatedAt) {
    public static PaperSectionResponse from(PaperSection section) {
        User assignedUser = section.getAssignedUser();
        String first = assignedUser == null || assignedUser.getFirstName() == null
                ? "" : assignedUser.getFirstName().trim();
        String last = assignedUser == null || assignedUser.getLastName() == null
                ? "" : assignedUser.getLastName().trim();
        String assignedUserName = assignedUser == null || (first + last).isEmpty()
                ? null : (first + " " + last).trim();
        return new PaperSectionResponse(
                section.getId(),
                section.getDocument() != null ? section.getDocument().getId() : null,
                assignedUser != null ? assignedUser.getId() : null,
                assignedUserName,
                section.getSectionOrder(),
                section.getSectionTitle(),
                section.getContentTex(),
                section.getPreviousContentTex(),
                section.getVersion(),
                section.getOptVersion(),
                section.getContentMdCache(),
                section.getUpdatedAt());
    }
}
