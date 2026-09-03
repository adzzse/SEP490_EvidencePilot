package com.evidencepilot.dto.response;

import java.util.List;

public record BatchUploadResponse(
        List<DocumentResponse> succeeded,
        List<UploadFailure> failed
) {
    public record UploadFailure(
            String filename,
            String errorMessage,
            String errorCode
    ) {
    }
}
