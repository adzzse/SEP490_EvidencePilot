package com.evidencepilot.service;

import com.evidencepilot.dto.request.AdminBroadcastRequest;
import com.evidencepilot.dto.request.AdminUserCreateRequest;
import com.evidencepilot.dto.request.AdminUserImportRequest;
import com.evidencepilot.dto.request.AdminUserStatusRequest;
import com.evidencepilot.dto.request.PagingRequest;
import com.evidencepilot.dto.response.AdminAuditLogResponse;
import com.evidencepilot.dto.response.AdminDashboardResponse;
import com.evidencepilot.dto.response.AdminProjectResponse;
import com.evidencepilot.dto.response.AdminUserResponse;
import com.evidencepilot.dto.response.AdminUserImportResponse;
import com.evidencepilot.dto.response.PagedResponse;
import com.evidencepilot.exception.ResourceNotFoundException;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.AccountStatus;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.ProcessingStatus;
import com.evidencepilot.model.enums.ProjectStatus;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.AuditLogRepository;
import com.evidencepilot.repository.CollectionRepository;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.ProjectRepository;
import com.evidencepilot.repository.CollectionCategoryRepository;
import com.evidencepilot.repository.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class AdminService {

    private static final Set<String> USER_SORT_FIELDS = Set.of(
            "createdAt", "email", "studentCode", "firstName", "lastName", "role", "accountStatus");
    private static final Pattern EMAIL_PATTERN = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");

    private final UserRepository users;
    private final ProjectRepository projects;
    private final CollectionCategoryRepository collectionCategories;
    private final CollectionRepository collections;
    private final DocumentRepository documents;
    private final AuditLogRepository auditLogs;
    private final CurrentUserService currentUsers;
    private final PasswordResetService passwordResets;
    private final AuditService audit;
    private final SystemNotificationService notifications;
    private final ObjectMapper objectMapper;
    private final PasswordEncoder passwords;

    @Transactional(readOnly = true)
    public PagedResponse<AdminUserResponse> getUsers(
            int page, int size, String sort, String q, UserRole role, AccountStatus status) {
        Pageable pageable = PagingRequest.pageable(page, size, sort, USER_SORT_FIELDS, "createdAt,desc");
        Specification<User> filters = (root, query, builder) -> builder.conjunction();
        filters = filters.and((root, query, builder) -> status == null
                ? builder.notEqual(root.get("accountStatus"), AccountStatus.DELETED)
                : builder.equal(root.get("accountStatus"), status));
        if (role != null) {
            filters = filters.and((root, query, builder) -> builder.equal(root.get("role"), role));
        }
        if (q != null && !q.isBlank()) {
            String pattern = "%" + q.trim().toLowerCase(Locale.ROOT) + "%";
            filters = filters.and((root, query, builder) -> builder.or(
                    builder.like(builder.lower(root.get("email")), pattern),
                    builder.like(builder.lower(root.get("studentCode")), pattern),
                    builder.like(builder.lower(root.get("firstName")), pattern),
                    builder.like(builder.lower(root.get("lastName")), pattern)));
        }
        return PagedResponse.from(users.findAll(filters, pageable).map(AdminUserResponse::from));
    }

    @Transactional
    public AdminUserResponse createUser(AdminUserCreateRequest request) {
        requireManagedRole(request.role());
        String email = normalizeEmail(request.email());
        if (email == null || !EMAIL_PATTERN.matcher(email).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A valid email is required");
        }
        if (users.existsByEmailIgnoreCase(email)) {
            throw conflict("Email already exists");
        }
        String studentCode = normalizeStudentCode(request.studentCode());
        validateStudentCode(request.role(), request.studentCode(), studentCode);
        if (studentCode != null && users.findByStudentCode(studentCode).isPresent()) {
            throw conflict("Student code already exists");
        }

        User user = new User();
        user.setEmail(email);
        user.setFirstName(request.firstName().trim());
        user.setLastName(request.lastName().trim());
        user.setRole(request.role());
        user.setStudentCode(studentCode);
        user.setAccountStatus(AccountStatus.ACTIVE);
        user.setPasswordChangeNoticePending(true);
        user.setPasswordHash(passwords.encode(temporaryPassword(email)));
        user.setCreatedAt(LocalDateTime.now());
        user = users.save(user);

        audit.record("USER_CREATED", "USER", user.getId(), currentUsers.requireCurrentUser(), null, safeUser(user));
        return AdminUserResponse.from(user);
    }

    @Transactional
    public AdminUserImportResponse importUsers(AdminUserImportRequest request) {
        List<AdminUserImportResponse.ImportError> errors = new ArrayList<>();
        if (request == null) {
            addImportError(errors, 0, "body", "JSON body is required");
            return new AdminUserImportResponse(0, 0, errors);
        }

        UserRole role = parseImportRole(request.role(), errors);
        List<AdminUserImportRequest.UserItem> items = request.users();
        if (items == null || items.isEmpty()) {
            addImportError(errors, 0, "users", "At least one user is required");
        } else if (items.size() > 200) {
            addImportError(errors, 0, "users", "A maximum of 200 users is allowed");
        }
        if (!errors.isEmpty()) {
            return new AdminUserImportResponse(0, 0, errors);
        }

        List<ImportRow> rows = new ArrayList<>();
        Map<String, Integer> emailItems = new HashMap<>();
        Map<String, Integer> codeItems = new HashMap<>();
        for (int index = 0; index < items.size(); index++) {
            int itemNumber = index + 1;
            AdminUserImportRequest.UserItem item = items.get(index);
            if (item == null) {
                addImportError(errors, itemNumber, "item", "User item is required");
                continue;
            }

            String email = normalizeEmail(item.email());
            String firstName = trim(item.firstName());
            String lastName = trim(item.lastName());
            String studentCode = normalizeStudentCode(item.studentCode());
            if (email == null || email.length() > 255 || !EMAIL_PATTERN.matcher(email).matches()) {
                addImportError(errors, itemNumber, "email", "A valid email is required");
            } else {
                Integer duplicate = emailItems.putIfAbsent(email, itemNumber);
                if (duplicate != null) {
                    addImportError(errors, itemNumber, "email", "Email duplicates item " + duplicate);
                }
            }
            validateImportName(errors, itemNumber, "firstName", firstName);
            validateImportName(errors, itemNumber, "lastName", lastName);
            if (role == UserRole.STUDENT) {
                if (studentCode == null) {
                    addImportError(errors, itemNumber, "studentCode", "Student code is required for STUDENT");
                } else if (studentCode.length() > 50) {
                    addImportError(errors, itemNumber, "studentCode", "Student code must not exceed 50 characters");
                } else {
                    Integer duplicate = codeItems.putIfAbsent(studentCode, itemNumber);
                    if (duplicate != null) {
                        addImportError(errors, itemNumber, "studentCode", "Student code duplicates item " + duplicate);
                    }
                }
            } else if (item.studentCode() != null) {
                addImportError(errors, itemNumber, "studentCode", "INSTRUCTOR must omit studentCode");
            }
            rows.add(new ImportRow(itemNumber, email, firstName, lastName, studentCode));
        }
        if (!errors.isEmpty()) {
            return new AdminUserImportResponse(0, 0, errors);
        }

        Map<String, User> existingByEmail = new HashMap<>();
        for (User user : users.findAllByEmailIn(emailItems.keySet())) {
            existingByEmail.put(normalizeEmail(user.getEmail()), user);
        }
        Map<String, User> existingByCode = new HashMap<>();
        if (!codeItems.isEmpty()) {
            for (User user : users.findAllByStudentCodeIn(codeItems.keySet())) {
                existingByCode.put(normalizeStudentCode(user.getStudentCode()), user);
            }
        }

        for (ImportRow row : rows) {
            User target = existingByEmail.get(row.email());
            if (target != null && (target.getRole() != role
                    || target.getAccountStatus() == AccountStatus.DELETED)) {
                addImportError(errors, row.item(), "email", "Existing user cannot be updated for this role");
            }
            User codeOwner = row.studentCode() == null ? null : existingByCode.get(row.studentCode());
            if (codeOwner != null && (target == null || !codeOwner.getId().equals(target.getId()))) {
                addImportError(errors, row.item(), "studentCode", "Student code belongs to another user");
            }
        }
        if (!errors.isEmpty()) {
            return new AdminUserImportResponse(0, 0, errors);
        }

        int created = 0;
        int updated = 0;
        List<User> changedUsers = new ArrayList<>();
        Map<UUID, Map<String, Object>> previousValues = new HashMap<>();
        for (ImportRow row : rows) {
            User user = existingByEmail.get(row.email());
            if (user == null) {
                user = new User();
                user.setEmail(row.email());
                user.setRole(role);
                user.setAccountStatus(AccountStatus.ACTIVE);
                user.setPasswordChangeNoticePending(true);
                user.setPasswordHash(passwords.encode(temporaryPassword(row.email())));
                user.setCreatedAt(LocalDateTime.now());
                created++;
            } else {
                previousValues.put(user.getId(), safeUser(user));
                updated++;
            }
            user.setFirstName(row.firstName());
            user.setLastName(row.lastName());
            user.setStudentCode(row.studentCode());
            changedUsers.add(user);
        }

        users.saveAll(changedUsers);
        User actor = currentUsers.requireCurrentUser();
        for (User user : changedUsers) {
            audit.record("USER_IMPORTED", "USER", user.getId(), actor,
                    previousValues.get(user.getId()), safeUser(user));
        }
        return new AdminUserImportResponse(created, updated, List.of());
    }

    @Transactional
    public AdminUserResponse updateStatus(UUID id, AdminUserStatusRequest request) {
        User user = requireMutableUser(id);
        if (user.getAccountStatus() == AccountStatus.DELETED
                || request.status() == AccountStatus.DELETED
                || user.getAccountStatus() == request.status()) {
            throw conflict("Status change is not allowed");
        }
        AccountStatus oldStatus = user.getAccountStatus();
        user.setAccountStatus(request.status());
        user.setTokenVersion(user.getTokenVersion() + 1);
        users.save(user);
        audit.record("USER_STATUS_UPDATED", "USER", id, currentUsers.requireCurrentUser(),
                Map.of("accountStatus", oldStatus), Map.of("accountStatus", user.getAccountStatus()));
        return AdminUserResponse.from(user);
    }

    @Transactional
    public void deleteUser(UUID id) {
        User user = requireMutableUser(id);
        if (user.getAccountStatus() == AccountStatus.DELETED) {
            throw conflict("User is already deleted");
        }
        AccountStatus oldStatus = user.getAccountStatus();
        user.setAccountStatus(AccountStatus.DELETED);
        user.setPasswordResetTokenHash(null);
        user.setPasswordResetTokenExpiresAt(null);
        user.setPasswordResetRequestedAt(null);
        user.setTokenVersion(user.getTokenVersion() + 1);
        users.save(user);
        audit.record("USER_DELETED", "USER", id, currentUsers.requireCurrentUser(),
                Map.of("accountStatus", oldStatus), Map.of("accountStatus", AccountStatus.DELETED));
    }

    @Transactional
    public void requestPasswordReset(UUID id) {
        User user = requireUser(id);
        if (user.getRole() == UserRole.ADMIN || user.getAccountStatus() == AccountStatus.DELETED) {
            throw conflict("Account is not eligible for password reset");
        }
        LocalDateTime previousRequest = user.getPasswordResetRequestedAt();
        passwordResets.requestResetFor(user);
        if (!Objects.equals(previousRequest, user.getPasswordResetRequestedAt())) {
            audit.record("PASSWORD_RESET_REQUESTED", "USER", id, currentUsers.requireCurrentUser(), null,
                    Map.of("email", user.getEmail()));
        }
    }

    @Transactional(readOnly = true)
    public AdminDashboardResponse getDashboard() {
        EnumMap<UserRole, Long> usersByRole = zeroes(UserRole.class);
        for (Object[] row : users.countByRole()) {
            usersByRole.put((UserRole) row[0], ((Number) row[1]).longValue());
        }
        EnumMap<AccountStatus, Long> usersByStatus = zeroes(AccountStatus.class);
        for (Object[] row : users.countByAccountStatus()) {
            usersByStatus.put((AccountStatus) row[0], ((Number) row[1]).longValue());
        }
        EnumMap<ProjectStatus, Long> projectsByStatus = zeroes(ProjectStatus.class);
        for (Object[] row : projects.countActiveByStatus()) {
            projectsByStatus.put((ProjectStatus) row[0], ((Number) row[1]).longValue());
        }
        return new AdminDashboardResponse(
                users.count(), usersByRole, usersByStatus,
                projects.countByActiveTrue(), projectsByStatus,
                collectionCategories.countByActiveTrue(), collections.countByActiveTrue(),
                documents.countByActiveTrueAndDocType(DocumentType.SOURCE),
                documents.countByActiveTrueAndDocType(DocumentType.PAPER));
    }

    @Transactional(readOnly = true)
    public PagedResponse<AdminAuditLogResponse> getAuditLogs(
            int page, int size, UUID actorId, String entityType, UUID entityId) {
        Pageable pageable = PagingRequest.pageable(page, size, "occurredAt,desc", Set.of("occurredAt"), "occurredAt,desc");
        Page<com.evidencepilot.model.AuditLog> result;
        if (actorId != null && entityType != null && !entityType.isBlank() && entityId != null) {
            result = auditLogs.findByActorIdAndEntityTypeAndEntityIdOrderByOccurredAtDesc(
                    actorId, entityType, entityId, pageable);
        } else if (actorId != null) {
            result = auditLogs.findByActorIdOrderByOccurredAtDesc(actorId, pageable);
        } else if (entityType != null && !entityType.isBlank() && entityId != null) {
            result = auditLogs.findByEntityTypeAndEntityIdOrderByOccurredAtDesc(entityType, entityId, pageable);
        } else {
            result = auditLogs.findAllByOrderByOccurredAtDesc(pageable);
        }
        return PagedResponse.from(result.map(AdminAuditLogResponse::from));
    }

    @Transactional
    public long broadcast(AdminBroadcastRequest request) {
        User actor = currentUsers.requireCurrentUser();
        List<User> recipients = request.role() == null
                ? users.findByAccountStatus(AccountStatus.ACTIVE)
                : users.findByAccountStatusAndRole(AccountStatus.ACTIVE, request.role());
        String actionType = request.urgent() ? "ADMIN_BROADCAST_URGENT" : "ADMIN_BROADCAST";
        for (User recipient : recipients) {
            notifications.createNotification(recipient, actor, actionType, null, request.message());
        }
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("message", request.message());
        metadata.put("role", request.role());
        metadata.put("urgent", request.urgent());
        metadata.put("recipientCount", recipients.size());
        audit.record("NOTIFICATION_BROADCAST", "SYSTEM_NOTIFICATION", null, actor, null, metadata);
        return recipients.size();
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getExtractionQueue() {
        Map<String, Long> counts = new LinkedHashMap<>();
        for (ProcessingStatus s : ProcessingStatus.values()) {
            counts.put(s.name(), documents.countByProcessingStatus(s));
        }
        List<Map<String, Object>> queued = queueRows(ProcessingStatus.QUEUED);
        List<Map<String, Object>> processing = queueRows(ProcessingStatus.PROCESSING);
        List<Map<String, Object>> ready = queueRows(ProcessingStatus.READY);
        List<Map<String, Object>> failed = queueRows(ProcessingStatus.FAILED);
        return Map.of("counts", counts, "queued", queued, "processing", processing, "ready", ready, "failed", failed);
    }

    private List<Map<String, Object>> queueRows(ProcessingStatus status) {
        return documents.findByProcessingStatusAndActiveTrue(status).stream().limit(50).map(d -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", d.getId());
            m.put("originalFilename", d.getOriginalFilename());
            m.put("projectName", d.getProject() != null ? d.getProject().getTitle() : null);
            m.put("processingError", d.getProcessingError());
            m.put("createdAt", d.getCreatedAt() != null ? d.getCreatedAt().toString() : null);
            return m;
        }).toList();
    }

    @Transactional(readOnly = true)
    public PagedResponse<Map<String, Object>> getDocuments(int page, int size, String q, UUID projectId, UUID collectionId) {
        Pageable pageable = PagingRequest.pageable(page, size, "createdAt,desc",
                Set.of("createdAt", "title", "doi", "processingStatus"), "createdAt,desc");
        return PagedResponse.from(documents.findAll(documentFilters(q, projectId, collectionId), pageable).map(this::documentRow));
    }

    @Transactional(readOnly = true)
    public Map<String, Long> getDocumentCounts(String q, UUID projectId, UUID collectionId) {
        Specification<Document> filters = documentFilters(q, projectId, collectionId);
        return Map.of(
                "total", documents.count(filters),
                "processed", documents.count(filters.and((root, query, cb) -> root.get("processingStatus")
                        .in(ProcessingStatus.COMPLETED, ProcessingStatus.READY))),
                "failed", documents.count(filters.and((root, query, cb) -> root.get("processingStatus")
                        .in(ProcessingStatus.FAILED, ProcessingStatus.PARTIAL)))
        );
    }

    private Specification<Document> documentFilters(String q, UUID projectId, UUID collectionId) {
        return (root, query, cb) -> {
            List<jakarta.persistence.criteria.Predicate> predicates = new ArrayList<>();
            if (projectId != null) {
                predicates.add(cb.equal(root.get("project").get("id"), projectId));
            }
            if (collectionId != null) {
                predicates.add(cb.equal(root.get("collection").get("id"), collectionId));
            }
            if (q != null && !q.isBlank()) {
                String like = "%" + q.trim().toLowerCase(Locale.ROOT) + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("title")), like),
                        cb.like(cb.lower(root.get("originalFilename")), like)));
            }
            return cb.and(predicates.toArray(jakarta.persistence.criteria.Predicate[]::new));
        };
    }

    @Transactional(readOnly = true)
    public PagedResponse<AdminProjectResponse> getProjects(int page, int size, String q, ProjectStatus status) {
        Pageable pageable = PagingRequest.pageable(page, size, "createdAt,desc",
                Set.of("createdAt", "title", "status"), "createdAt,desc");
        Specification<Project> spec = (root, query, cb) -> {
            List<jakarta.persistence.criteria.Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.get("active"), true));
            if (status != null) {
                predicates.add(cb.equal(root.get("status"), status));
            }
            if (q != null && !q.isBlank()) {
                String like = "%" + q.trim().toLowerCase(Locale.ROOT) + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("title")), like),
                        cb.like(cb.lower(root.get("description")), like)));
            }
            return cb.and(predicates.toArray(jakarta.persistence.criteria.Predicate[]::new));
        };
        return PagedResponse.from(projects.findAll(spec, pageable).map(AdminProjectResponse::from));
    }

    private Map<String, Object> documentRow(Document d) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", d.getId());
        m.put("title", d.getTitle());
        m.put("originalFilename", d.getOriginalFilename());
        m.put("doi", d.getDoi());
        m.put("processingStatus", d.getProcessingStatus() != null ? d.getProcessingStatus().name() : null);
        m.put("projectName", d.getProject() != null ? d.getProject().getTitle() : null);
        return m;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getBroadcastHistory() {
        Pageable pageable = PagingRequest.pageable(0, 20, "occurredAt,desc", Set.of("occurredAt"), "occurredAt,desc");
        return auditLogs.findByActionOrderByOccurredAtDesc("NOTIFICATION_BROADCAST", pageable)
                .map(log -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("actorEmail", log.getActor() != null ? log.getActor().getEmail() : null);
                    m.put("occurredAt", log.getOccurredAt() != null ? log.getOccurredAt().toString() : null);
                    try {
                        m.put("details", log.getNewValue() != null
                                ? objectMapper.readValue(log.getNewValue(), Map.class)
                                : null);
                    } catch (Exception e) {
                        m.put("details", log.getNewValue());
                    }
                    return m;
                }).toList();
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getCollections() {
        return collections.findAll().stream()
                .filter(c -> c.isActive())
                .map(c -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", c.getId());
                    m.put("name", c.getTitle());
                    m.put("description", c.getDescription());
                    m.put("instructorEmail", c.getInstructor() != null ? c.getInstructor().getEmail() : null);
                    m.put("categoryName", c.getCategory() != null ? c.getCategory().getName() : null);
                    m.put("createdAt", c.getCreatedAt() != null ? c.getCreatedAt().toString() : null);
                    m.put("active", c.isActive());
                    m.put("documentCount", documents.countByCollectionId(c.getId()));
                    return m;
                }).toList();
    }

    private User requireMutableUser(UUID id) {
        User user = requireUser(id);
        if (user.getRole() != UserRole.STUDENT && user.getRole() != UserRole.INSTRUCTOR) {
            throw conflict("User account is immutable");
        }
        return user;
    }

    private User requireUser(UUID id) {
        return users.findById(id).orElseThrow(() -> new ResourceNotFoundException(id, "User"));
    }

    private void requireManagedRole(UserRole role) {
        if (role != UserRole.STUDENT && role != UserRole.INSTRUCTOR) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Only STUDENT and INSTRUCTOR roles are allowed");
        }
    }

    private void validateStudentCode(UserRole role, String rawCode, String studentCode) {
        if (role == UserRole.STUDENT && studentCode == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Student code is required for STUDENT");
        }
        if (role == UserRole.INSTRUCTOR && rawCode != null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "INSTRUCTOR must omit studentCode");
        }
    }

    private UserRole parseImportRole(String value, List<AdminUserImportResponse.ImportError> errors) {
        if (value != null) {
            try {
                UserRole role = UserRole.valueOf(value.trim().toUpperCase(Locale.ROOT));
                if (role == UserRole.STUDENT || role == UserRole.INSTRUCTOR) {
                    return role;
                }
            } catch (IllegalArgumentException ignored) {
                // Report the same stable validation error for every unsupported value.
            }
        }
        addImportError(errors, 0, "role", "Role must be STUDENT or INSTRUCTOR");
        return null;
    }

    private void validateImportName(List<AdminUserImportResponse.ImportError> errors,
                                    int item, String field, String value) {
        if (value == null) {
            addImportError(errors, item, field, field + " is required");
        } else if (value.length() > 100) {
            addImportError(errors, item, field, field + " must not exceed 100 characters");
        }
    }

    private void addImportError(List<AdminUserImportResponse.ImportError> errors,
                                int item, String field, String message) {
        errors.add(new AdminUserImportResponse.ImportError(item, field, message));
    }

    private String normalizeEmail(String value) {
        String normalized = trim(value);
        return normalized == null ? null : normalized.toLowerCase(Locale.ROOT);
    }

    private String normalizeStudentCode(String value) {
        String normalized = trim(value);
        return normalized == null ? null : normalized.toUpperCase(Locale.ROOT);
    }

    private String trim(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }

    private String temporaryPassword(String email) {
        return email.substring(0, email.indexOf('@')).toLowerCase(Locale.ROOT);
    }

    private ResponseStatusException conflict(String message) {
        return new ResponseStatusException(HttpStatus.CONFLICT, message);
    }

    private Map<String, Object> safeUser(User user) {
        Map<String, Object> value = new LinkedHashMap<>();
        value.put("email", user.getEmail());
        value.put("role", user.getRole());
        value.put("accountStatus", user.getAccountStatus());
        value.put("studentCode", user.getStudentCode());
        value.put("firstName", user.getFirstName());
        value.put("lastName", user.getLastName());
        return value;
    }

    private <E extends Enum<E>> EnumMap<E, Long> zeroes(Class<E> type) {
        EnumMap<E, Long> counts = new EnumMap<>(type);
        for (E value : type.getEnumConstants()) {
            counts.put(value, 0L);
        }
        return counts;
    }

    private record ImportRow(int item, String email, String firstName, String lastName, String studentCode) {
    }
}
