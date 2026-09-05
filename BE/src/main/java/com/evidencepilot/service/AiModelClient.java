package com.evidencepilot.service;

import java.util.List;
import java.util.Map;
import java.util.function.Function;

public interface AiModelClient {

    Map<String, Object> health();

    GenerationResult generate(String system, String prompt);

    GenerationResult generateForReview(String system, String prompt);

    GenerationResult generateStrict(String system, String prompt, Map<String, Object> jsonSchema);

    <T> T generateValidated(String system, String prompt, Map<String, Object> jsonSchema,
            Function<GenerationResult, T> validator);

    ExtractionBundle extractDocument(String filename, String downloadUrl);

    List<Float> generateEmbedding(String text);

    List<List<Float>> generateEmbeddings(List<String> texts);

    record GenerationResult(String provider, String model, String response, boolean done,
            int modelIndex, int attempt, Integer nextModelIndex) {
        public GenerationResult(String provider, String model, String response) {
            this(provider, model, response, true, 0, 1, null);
        }
    }

    record ExtractionBlock(String type, String text, Integer level, String caption) {
        public boolean valid() {
            if (type == null || text == null || text.isBlank()
                    || caption != null && caption.isBlank()) {
                return false;
            }
            boolean knownType = switch (type) {
                case "heading", "paragraph", "list", "table", "figure_caption",
                        "equation", "code", "reference" -> true;
                default -> false;
            };
            if (!knownType) {
                return false;
            }
            return "heading".equals(type)
                    ? level != null && level >= 1 && level <= 6
                    : level == null;
        }
    }

    record ExtractedDocument(String markdown, List<ExtractionBlock> blocks, List<String> images) {
        public ExtractedDocument {
            blocks = blocks == null ? null : List.copyOf(blocks);
            images = images == null ? null : List.copyOf(images);
        }

        public boolean valid() {
            return markdown != null && !markdown.isBlank()
                    && blocks != null && !blocks.isEmpty()
                    && blocks.stream().allMatch(block -> block != null && block.valid())
                    && images != null
                    && images.stream().allMatch(ExtractionBundle::validImagePath)
                    && images.stream().distinct().count() == images.size();
        }
    }

    record ExtractionResult(
        String status,
        String method,
        String markdown,
        ExtractionMetadata metadata,
        java.util.List<String> warnings
    ) {}

    record ExtractionMetadata(
        int pageCount,
        int extractedPageCount,
        java.util.List<Integer> failedPages,
        java.util.Map<Integer, String> failureReasons,
        int totalChars,
        String detectedLanguage
    ) {}

    final class AiApiException extends RuntimeException {
        private final int statusCode;
        private final String code;
        private final Long retryAfterMillis;

        public AiApiException(String endpoint, int statusCode) {
            this(endpoint, statusCode, null, null);
        }

        public AiApiException(String endpoint, int statusCode, Throwable cause) {
            this(endpoint, statusCode, null, cause);
        }

        public AiApiException(String endpoint, int statusCode, String message, Throwable cause) {
            this(endpoint, statusCode, message, null, null, cause);
        }

        public AiApiException(String endpoint, int statusCode, String message,
                String code, Long retryAfterMillis, Throwable cause) {
            super("AI API error on " + endpoint + " - HTTP " + statusCode + (message != null ? " " + message : ""),
                    cause);
            this.statusCode = statusCode;
            this.code = code;
            this.retryAfterMillis = retryAfterMillis;
        }

        public AiApiException(String endpoint, String message, Throwable cause) {
            super("AI API error on " + endpoint + " - " + message, cause);
            this.statusCode = 0;
            this.code = null;
            this.retryAfterMillis = null;
        }

        public int getStatusCode() {
            return statusCode;
        }

        public String getCode() {
            return code;
        }

        public Long getRetryAfterMillis() {
            return retryAfterMillis;
        }
    }
}
