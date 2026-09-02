package com.evidencepilot.controller;

import com.evidencepilot.client.openalex.OpenAlexClient;
import com.evidencepilot.service.AiModelClient;
import com.evidencepilot.dto.response.ApiErrorResponse;
import com.evidencepilot.exception.AiValidationException;
import com.evidencepilot.exception.ResourceNotFoundException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;
import org.springframework.web.server.ResponseStatusException;

import java.util.LinkedHashMap;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiErrorResponse> handleValidation(
            MethodArgumentNotValidException exception,
            HttpServletRequest request) {

        Map<String, String> fieldErrors = new LinkedHashMap<>();
        for (FieldError fieldError : exception.getBindingResult().getFieldErrors()) {
            fieldErrors.putIfAbsent(fieldError.getField(), fieldError.getDefaultMessage());
        }

        return build(HttpStatus.BAD_REQUEST, "Validation failed", request, fieldErrors);
    }

    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<ApiErrorResponse> handleMissingParameter(
            MissingServletRequestParameterException exception,
            HttpServletRequest request) {

        return build(HttpStatus.BAD_REQUEST, exception.getMessage(), request);
    }

    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ApiErrorResponse> handleResourceNotFound(
            ResourceNotFoundException exception,
            HttpServletRequest request) {

        return build(HttpStatus.NOT_FOUND, exception.getMessage(), request);
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ApiErrorResponse> handleResponseStatus(
            ResponseStatusException exception,
            HttpServletRequest request) {

        HttpStatus status = HttpStatus.valueOf(exception.getStatusCode().value());
        String message = exception.getReason() == null ? status.getReasonPhrase() : exception.getReason();
        return build(status, message, request);
    }

    @ExceptionHandler(AiValidationException.class)
    public ResponseEntity<ApiErrorResponse> handleAiValidation(
            AiValidationException exception,
            HttpServletRequest request) {

        return build(HttpStatus.BAD_GATEWAY, exception.getMessage(), request);
    }

    @ExceptionHandler(AiModelClient.AiApiException.class)
    public ResponseEntity<ApiErrorResponse> handleAiApi(
            AiModelClient.AiApiException exception,
            HttpServletRequest request) {

        HttpStatus status = HttpStatus.resolve(exception.getStatusCode());
        return build(status == null ? HttpStatus.SERVICE_UNAVAILABLE : status,
                exception.getMessage(), request);
    }

    @ExceptionHandler(OpenAlexClient.OpenAlexApiException.class)
    public ResponseEntity<ApiErrorResponse> handleOpenAlexApi(
            OpenAlexClient.OpenAlexApiException exception,
            HttpServletRequest request) {

        HttpStatus status = switch (exception.getStatusCode()) {
            case 400 -> HttpStatus.BAD_REQUEST;
            case 404 -> HttpStatus.NOT_FOUND;
            default -> HttpStatus.BAD_GATEWAY;
        };
        return build(status, exception.getMessage(), request);
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ApiErrorResponse> handleDataIntegrity(
            DataIntegrityViolationException exception,
            HttpServletRequest request) {

        return build(HttpStatus.CONFLICT, "Request conflicts with existing data.", request);
    }

    @ExceptionHandler(ObjectOptimisticLockingFailureException.class)
    public ResponseEntity<ApiErrorResponse> handleOptimisticLocking(
            ObjectOptimisticLockingFailureException exception,
            HttpServletRequest request) {

        return build(HttpStatus.CONFLICT,
                "This item was modified by someone else. Reload and try again.", request);
    }

    @ExceptionHandler(com.evidencepilot.exception.SectionConflictException.class)
    public ResponseEntity<ApiErrorResponse> handleSectionConflict(
            com.evidencepilot.exception.SectionConflictException exception,
            HttpServletRequest request) {

        Map<String, String> fieldErrors = new LinkedHashMap<>();
        fieldErrors.put("sectionId", exception.getSectionId().toString());
        fieldErrors.put("code", "SECTION_REVISION_CONFLICT");
        fieldErrors.put("expectedRevision", String.valueOf(exception.getExpectedRevision()));
        fieldErrors.put("actualRevision", String.valueOf(exception.getActualRevision()));
        return build(HttpStatus.CONFLICT, exception.getMessage(), request, fieldErrors);
    }

    @ExceptionHandler(MultipartException.class)
    public ResponseEntity<ApiErrorResponse> handleMultipart(
            MultipartException exception,
            HttpServletRequest request) {

        return build(HttpStatus.BAD_REQUEST, "File upload failed.", request);
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ApiErrorResponse> handleMaxUploadSize(
            MaxUploadSizeExceededException exception,
            HttpServletRequest request) {

        return build(HttpStatus.PAYLOAD_TOO_LARGE, "File size exceeds the 50MB limit", request);
    }

    private ResponseEntity<ApiErrorResponse> build(HttpStatus status, String message,
                                                   HttpServletRequest request) {
        ApiErrorResponse body = ApiErrorResponse.of(
                status.value(),
                status.getReasonPhrase(),
                message,
                request.getRequestURI()
        );
        return ResponseEntity.status(status).body(body);
    }

    private ResponseEntity<ApiErrorResponse> build(HttpStatus status, String message,
                                                   HttpServletRequest request,
                                                   Map<String, String> fieldErrors) {
        ApiErrorResponse body = ApiErrorResponse.validation(
                status.value(),
                status.getReasonPhrase(),
                message,
                request.getRequestURI(),
                fieldErrors
        );
        return ResponseEntity.status(status).body(body);
    }
}
