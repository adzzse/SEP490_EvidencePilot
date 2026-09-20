package com.evidencepilot.dto.response;

import com.evidencepilot.model.FeedbackRequest;
import org.springframework.data.domain.Page;

import java.util.List;

public record FeedbackRequestPageResponse(
        List<FeedbackRequestResponseDto> content,
        int page,
        int size,
        long totalElements,
        int totalPages
) {
    public static FeedbackRequestPageResponse from(Page<FeedbackRequest> result) {
        return new FeedbackRequestPageResponse(
                result.getContent().stream().map(FeedbackRequestResponseDto::fromEntity).toList(),
                result.getNumber(),
                result.getSize(),
                result.getTotalElements(),
                result.getTotalPages());
    }
}
