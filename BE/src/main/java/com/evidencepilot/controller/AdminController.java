package com.evidencepilot.controller;

import com.evidencepilot.dto.request.AdminBroadcastRequest;
import com.evidencepilot.dto.request.AdminUserCreateRequest;
import com.evidencepilot.dto.request.AdminUserImportRequest;
import com.evidencepilot.dto.request.AdminUserStatusRequest;
import com.evidencepilot.dto.response.AdminAuditLogResponse;
import com.evidencepilot.dto.response.AdminDashboardResponse;
import com.evidencepilot.dto.response.AdminProjectResponse;
import com.evidencepilot.dto.response.AdminUserResponse;
import com.evidencepilot.dto.response.AdminUserImportResponse;
import com.evidencepilot.dto.response.BroadcastResponse;
import com.evidencepilot.dto.response.PagedResponse;
import com.evidencepilot.model.enums.AccountStatus;
import com.evidencepilot.model.enums.ProjectStatus;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.service.AdminService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin")
@PreAuthorize("hasRole('ADMIN')")
@RequiredArgsConstructor
@Tag(name = "Administration", description = "User administration, audit, dashboard, and broadcast operations")
public class AdminController {

    private final AdminService adminService;
    private final ObjectMapper objectMapper;

    @Value("${jwt.expiration-ms}")
    private String jwtExpirationMs;

    @Value("${minio.url}")
    private String minioUrl;

    @Value("${minio.bucket-name}")
    private String minioBucket;

    @Value("${minio.public-url:}")
    private String minioPublicUrl;

    @Value("${qdrant.url}")
    private String qdrantUrl;

    @Value("${ai.model.base-url}")
    private String aiModelBaseUrl;

    @Value("${openalex.api-base-url}")
    private String openalexBaseUrl;

    @Value("${rabbitmq.management-url:}")
    private String rabbitMqManagementUrl;

    @GetMapping("/config")
    public Map<String, String> getConfig() {
        return Map.of(
                "jwtExpirationMs", jwtExpirationMs,
                "minioUrl", minioUrl,
                "minioBucket", minioBucket,
                "minioPublicUrl", minioPublicUrl,
                "qdrantUrl", qdrantUrl,
                "aiModelBaseUrl", aiModelBaseUrl,
                "openalexBaseUrl", openalexBaseUrl,
                "rabbitMqManagementUrl", rabbitMqManagementUrl
        );
    }

    @GetMapping("/users")
    public PagedResponse<AdminUserResponse> users(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "createdAt,desc") String sort,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) UserRole role,
            @RequestParam(required = false) AccountStatus status) {
        return adminService.getUsers(page, size, sort, q, role, status);
    }

    @PostMapping("/users")
    @ResponseStatus(HttpStatus.CREATED)
    public AdminUserResponse createUser(@Valid @RequestBody AdminUserCreateRequest request) {
        return adminService.createUser(request);
    }

    @PostMapping(value = "/users/import", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<AdminUserImportResponse> importUsers(
            @RequestBody(required = false) String json) {
        AdminUserImportRequest request;
        try {
            request = json == null ? null : objectMapper.readValue(json, AdminUserImportRequest.class);
        } catch (JsonProcessingException exception) {
            return ResponseEntity.badRequest().body(new AdminUserImportResponse(
                    0, 0, List.of(new AdminUserImportResponse.ImportError(
                            0, "body", "Invalid JSON structure"))));
        }
        AdminUserImportResponse response = adminService.importUsers(request);
        HttpStatus status = response.errors().isEmpty() ? HttpStatus.CREATED : HttpStatus.BAD_REQUEST;
        return ResponseEntity.status(status).body(response);
    }

    @PatchMapping("/users/{id}/status")
    public AdminUserResponse updateStatus(@PathVariable UUID id, @Valid @RequestBody AdminUserStatusRequest request) {
        return adminService.updateStatus(id, request);
    }

    @DeleteMapping("/users/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteUser(@PathVariable UUID id) {
        adminService.deleteUser(id);
    }

    @PostMapping("/users/{id}/password-reset")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public void requestPasswordReset(@PathVariable UUID id) {
        adminService.requestPasswordReset(id);
    }

    @PostMapping("/users/{id}/resend-invitation")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public void resendInvitation(@PathVariable UUID id) {
        adminService.resendInvitation(id);
    }

    @GetMapping("/dashboard")
    public AdminDashboardResponse dashboard() {
        return adminService.getDashboard();
    }

    @GetMapping("/audit-logs")
    public PagedResponse<AdminAuditLogResponse> auditLogs(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) UUID actorId,
            @RequestParam(required = false) String entityType,
            @RequestParam(required = false) UUID entityId) {
        return adminService.getAuditLogs(page, size, actorId, entityType, entityId);
    }

    @PostMapping("/notifications/broadcast")
    public BroadcastResponse broadcast(@Valid @RequestBody AdminBroadcastRequest request) {
        return new BroadcastResponse(adminService.broadcast(request));
    }

    @GetMapping("/documents/extraction-queue")
    public Map<String, Object> extractionQueue() {
        return adminService.getExtractionQueue();
    }

    @GetMapping("/documents")
    public PagedResponse<Map<String, Object>> documents(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) UUID projectId,
            @RequestParam(required = false) UUID collectionId) {
        return adminService.getDocuments(page, size, q, projectId, collectionId);
    }

    @GetMapping("/documents/counts")
    public Map<String, Long> documentCounts(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) UUID projectId,
            @RequestParam(required = false) UUID collectionId) {
        return adminService.getDocumentCounts(q, projectId, collectionId);
    }

    @GetMapping("/projects")
    public PagedResponse<AdminProjectResponse> projects(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) ProjectStatus status) {
        return adminService.getProjects(page, size, q, status);
    }

    @GetMapping("/notifications/broadcast-history")
    public List<Map<String, Object>> broadcastHistory() {
        return adminService.getBroadcastHistory();
    }

    @GetMapping("/collections")
    public List<Map<String, Object>> collections() {
        return adminService.getCollections();
    }
}
