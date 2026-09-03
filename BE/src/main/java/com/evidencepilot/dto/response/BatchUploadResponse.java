package com.evidencepilot.dto.response;

import java.util.List;

public record BatchUploadResponse(
        List<DocumentResponse> succeeded,
        List<UploadFailure> failed
) {
    public record UploadFailure(
            int index,
            String filename,
            String errorCode,
            String errorMessage,
            boolean retryable
    ) {
    }
}
