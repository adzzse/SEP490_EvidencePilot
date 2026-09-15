package com.evidencepilot.service.impl;

import com.evidencepilot.dto.response.ReviewGuideResponse;
import com.evidencepilot.model.ReviewGuide;
import com.evidencepilot.repository.ReviewGuideRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class ReviewGuideServiceImpl {

    private final ReviewGuideRepository reviewGuideRepository;
    private final CurrentUserServiceImpl currentUserService;
    private final ObjectMapper objectMapper;

    public List<ReviewGuideResponse> getActiveGuides() {
        currentUserService.requireCurrentUser();
        return reviewGuideRepository.findAllByActiveTrueOrderBySectionTypeAsc().stream()
                .map(this::toResponse)
                .toList();
    }

    private ReviewGuideResponse toResponse(ReviewGuide guide) {
        return new ReviewGuideResponse(
                guide.getSectionType(),
                guide.getGuidance(),
                parseChecklist(guide.getChecklistJson()));
    }

    private List<String> parseChecklist(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<List<String>>() {
            });
        } catch (Exception e) {
            return List.of();
        }
    }
}
