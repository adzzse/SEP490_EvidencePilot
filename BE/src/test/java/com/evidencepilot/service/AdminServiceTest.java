package com.evidencepilot.service;

import com.evidencepilot.dto.request.AdminBroadcastRequest;
import com.evidencepilot.dto.request.AdminUserCreateRequest;
import com.evidencepilot.dto.request.AdminUserImportRequest;
import com.evidencepilot.dto.request.AdminUserStatusRequest;
import com.evidencepilot.model.AuditLog;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.AccountStatus;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.ProjectStatus;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.AuditLogRepository;
import com.evidencepilot.repository.CollectionRepository;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.ProjectRepository;
import com.evidencepilot.repository.CollectionCategoryRepository;
import com.evidencepilot.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdminServiceTest {

    @Mock UserRepository users;
    @Mock ProjectRepository projects;
    @Mock CollectionCategoryRepository collectionCategories;
    @Mock CollectionRepository collections;
    @Mock DocumentRepository documents;
    @Mock AuditLogRepository auditLogs;
    @Mock CurrentUserService currentUsers;
    @Mock PasswordResetService passwordResets;
    @Mock AuditService audit;
    @Mock SystemNotificationService notifications;
    @Mock PasswordEncoder passwords;
    @InjectMocks AdminService service;

    @Test
    void createsActiveUserWithEmailLocalPartPasswordAndAuditsSafeFields() {
        User admin = user(UserRole.ADMIN, AccountStatus.ACTIVE);
        when(currentUsers.requireCurrentUser()).thenReturn(admin);
        when(users.existsByEmailIgnoreCase("new@example.com")).thenReturn(false);
        when(passwords.encode(any())).thenReturn("$2a$10$random");
        when(users.save(any(User.class))).thenAnswer(invocation -> {
            User saved = invocation.getArgument(0);
            saved.setId(UUID.randomUUID());
            return saved;
        });

        var response = service.createUser(new AdminUserCreateRequest(
                " New@Example.com ", "New", "User", UserRole.INSTRUCTOR, null));

        ArgumentCaptor<User> captor = ArgumentCaptor.forClass(User.class);
        verify(users).save(captor.capture());
        User saved = captor.getValue();
        assertThat(saved.getAccountStatus()).isEqualTo(AccountStatus.ACTIVE);
        assertThat(saved.isPasswordChangeNoticePending()).isTrue();
        assertThat(saved.getStudentCode()).isNull();
        assertThat(saved.getPasswordHash()).startsWith("$2a$");
        verify(passwords).encode("new");
        verifyNoInteractions(passwordResets);
        ArgumentCaptor<Object> auditValue = ArgumentCaptor.forClass(Object.class);
        verify(audit).record(eq("USER_CREATED"), eq("USER"), eq(saved.getId()), eq(admin),
                isNull(), auditValue.capture());
        @SuppressWarnings("unchecked")
        Map<String, Object> safeAuditValue = (Map<String, Object>) auditValue.getValue();
        assertThat(safeAuditValue).containsOnlyKeys(
                "email", "role", "accountStatus", "studentCode", "firstName", "lastName");
        assertThat(auditValue.getValue().toString()).doesNotContainIgnoringCase(
                "password", "token", "reset", "link");
        assertThat(response.email()).isEqualTo("new@example.com");
        assertThat(java.util.Arrays.stream(response.getClass().getRecordComponents())
                .map(java.lang.reflect.RecordComponent::getName))
                .doesNotContain("passwordHash", "passwordResetTokenHash", "emailVerified");
    }

    @Test
    void createsStudentWithNormalizedStudentCode() {
        when(currentUsers.requireCurrentUser()).thenReturn(user(UserRole.ADMIN, AccountStatus.ACTIVE));
        when(users.findByStudentCode("SE170608")).thenReturn(Optional.empty());
        when(passwords.encode("student")).thenReturn("hash");
        when(users.save(any(User.class))).thenAnswer(invocation -> {
            User saved = invocation.getArgument(0);
            saved.setId(UUID.randomUUID());
            return saved;
        });

        var response = service.createUser(new AdminUserCreateRequest(
                "student@example.com", "Test", "Student", UserRole.STUDENT, " se170608 "));

        assertThat(response.studentCode()).isEqualTo("SE170608");
        verify(users).save(argThat(user -> user.getStudentCode().equals("SE170608")));
    }

    @Test
    void rejectsDuplicateAndInvalidCreationRoles() {
        when(users.existsByEmailIgnoreCase("duplicate@example.com")).thenReturn(true);
        assertConflict(() -> service.createUser(new AdminUserCreateRequest(
                "duplicate@example.com", "D", "U", UserRole.STUDENT, "SE1")));
        assertBadRequest(() -> service.createUser(new AdminUserCreateRequest(
                "admin@example.com", "A", "D", UserRole.ADMIN, null)));
        assertBadRequest(() -> service.createUser(new AdminUserCreateRequest(
                "student@example.com", "S", "T", UserRole.STUDENT, null)));
        assertBadRequest(() -> service.createUser(new AdminUserCreateRequest(
                "teacher@example.com", "T", "E", UserRole.INSTRUCTOR, "SE2")));
        verifyNoInteractions(passwordResets, audit);
    }

    @Test
    void importsStudentsByCreatingAndUpdatingWithoutResettingExistingSecurityState() {
        User admin = user(UserRole.ADMIN, AccountStatus.ACTIVE);
        User existing = user(UserRole.STUDENT, AccountStatus.BANNED);
        existing.setEmail("existing@example.com");
        existing.setFirstName("Old");
        existing.setStudentCode(null);
        existing.setPasswordHash("existing-hash");
        existing.setPasswordChangeNoticePending(true);
        when(currentUsers.requireCurrentUser()).thenReturn(admin);
        when(users.findAllByEmailIn(any())).thenReturn(List.of(existing));
        when(users.findAllByStudentCodeIn(any())).thenReturn(List.of());
        when(passwords.encode("newstudent")).thenReturn("new-hash");
        when(users.saveAll(any())).thenAnswer(invocation -> {
            List<User> saved = invocation.getArgument(0);
            saved.stream().filter(user -> user.getId() == null).forEach(user -> user.setId(UUID.randomUUID()));
            return saved;
        });

        var response = service.importUsers(new AdminUserImportRequest("STUDENT", List.of(
                new AdminUserImportRequest.UserItem(
                        " Existing@Example.com ", "Updated", "Student", " se170001 "),
                new AdminUserImportRequest.UserItem(
                        "NewStudent@fpt.com.edu", "New", "Student", " se170002 "))));

        assertThat(response.created()).isEqualTo(1);
        assertThat(response.updated()).isEqualTo(1);
        assertThat(response.errors()).isEmpty();
        assertThat(existing.getFirstName()).isEqualTo("Updated");
        assertThat(existing.getStudentCode()).isEqualTo("SE170001");
        assertThat(existing.getPasswordHash()).isEqualTo("existing-hash");
        assertThat(existing.getAccountStatus()).isEqualTo(AccountStatus.BANNED);
        assertThat(existing.isPasswordChangeNoticePending()).isTrue();

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<User>> savedUsers = ArgumentCaptor.forClass(List.class);
        verify(users).saveAll(savedUsers.capture());
        User created = savedUsers.getValue().stream()
                .filter(user -> user.getEmail().equals("newstudent@fpt.com.edu"))
                .findFirst().orElseThrow();
        assertThat(created.getStudentCode()).isEqualTo("SE170002");
        assertThat(created.getPasswordHash()).isEqualTo("new-hash");
        assertThat(created.getAccountStatus()).isEqualTo(AccountStatus.ACTIVE);
        assertThat(created.isPasswordChangeNoticePending()).isTrue();
        verify(passwords).encode("newstudent");
    }

    @Test
    void importsInstructorWithoutStudentCode() {
        User admin = user(UserRole.ADMIN, AccountStatus.ACTIVE);
        when(currentUsers.requireCurrentUser()).thenReturn(admin);
        when(users.findAllByEmailIn(any())).thenReturn(List.of());
        when(passwords.encode("teacher")).thenReturn("teacher-hash");
        when(users.saveAll(any())).thenAnswer(invocation -> {
            List<User> saved = invocation.getArgument(0);
            saved.forEach(user -> user.setId(UUID.randomUUID()));
            return saved;
        });

        var response = service.importUsers(new AdminUserImportRequest("INSTRUCTOR", List.of(
                new AdminUserImportRequest.UserItem(
                        "Teacher@fpt.com.edu", "Test", "Teacher", null))));

        assertThat(response.created()).isOne();
        assertThat(response.errors()).isEmpty();
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Iterable<User>> savedUsers = ArgumentCaptor.forClass(Iterable.class);
        verify(users).saveAll(savedUsers.capture());
        assertThat(savedUsers.getValue()).singleElement().satisfies(saved -> {
            assertThat(saved.getRole()).isEqualTo(UserRole.INSTRUCTOR);
            assertThat(saved.getStudentCode()).isNull();
            assertThat(saved.getPasswordHash()).isEqualTo("teacher-hash");
        });
    }

    @Test
    void rejectsInvalidImportStructureAndDuplicatesBeforeWriting() {
        var valid = new AdminUserImportRequest.UserItem(
                "student@example.com", "Test", "Student", "SE1");
        assertThat(service.importUsers(new AdminUserImportRequest("ADMIN", List.of(valid))).errors())
                .extracting("field").contains("role");

        assertThat(service.importUsers(new AdminUserImportRequest("STUDENT", List.of(
                new AdminUserImportRequest.UserItem("missing@example.com", "M", "S", null)))).errors())
                .extracting("field").contains("studentCode");
        assertThat(service.importUsers(new AdminUserImportRequest("INSTRUCTOR", List.of(
                new AdminUserImportRequest.UserItem("teacher@example.com", "T", "E", "SE2")))).errors())
                .extracting("field").contains("studentCode");
        assertThat(service.importUsers(new AdminUserImportRequest("STUDENT", List.of(
                valid,
                new AdminUserImportRequest.UserItem(" STUDENT@example.com ", "Other", "Student", "SE2"),
                new AdminUserImportRequest.UserItem("third@example.com", "Third", "Student", "se1")))).errors())
                .extracting("field").contains("email", "studentCode");

        verify(users, never()).saveAll(any());
    }

    @Test
    void rejectsImportsOverTwoHundredRowsBeforeWriting() {
        var valid = new AdminUserImportRequest.UserItem(
                "student@example.com", "Test", "Student", "SE1");
        List<AdminUserImportRequest.UserItem> tooMany = new ArrayList<>();
        for (int i = 0; i < 201; i++) {
            tooMany.add(valid);
        }

        assertThat(service.importUsers(new AdminUserImportRequest("STUDENT", tooMany)).errors())
                .extracting("field").contains("users");
        verify(users, never()).saveAll(any());
    }

    @Test
    void codeConflictDoesNotMutateExistingUser() {
        User existing = user(UserRole.STUDENT, AccountStatus.ACTIVE);
        existing.setEmail("existing@example.com");
        existing.setFirstName("Original");
        existing.setStudentCode("SE1");
        User owner = user(UserRole.STUDENT, AccountStatus.ACTIVE);
        owner.setStudentCode("SE2");
        when(users.findAllByEmailIn(any())).thenReturn(List.of(existing));
        when(users.findAllByStudentCodeIn(any())).thenReturn(List.of(owner));

        var response = service.importUsers(new AdminUserImportRequest("STUDENT", List.of(
                new AdminUserImportRequest.UserItem(
                        "existing@example.com", "Changed", "Name", "SE2"))));

        assertThat(response.errors()).extracting("field").containsExactly("studentCode");
        assertThat(existing.getFirstName()).isEqualTo("Original");
        assertThat(existing.getStudentCode()).isEqualTo("SE1");
        verify(users, never()).saveAll(any());
    }

    @Test
    void statusAndDeleteMutationsProtectAdminsAndIncrementTokenVersion() {
        User target = user(UserRole.STUDENT, AccountStatus.ACTIVE);
        target.setTokenVersion(4);
        User admin = user(UserRole.ADMIN, AccountStatus.ACTIVE);
        when(currentUsers.requireCurrentUser()).thenReturn(admin);
        when(users.findById(target.getId())).thenReturn(Optional.of(target));
        when(users.save(target)).thenReturn(target);

        service.updateStatus(target.getId(), new AdminUserStatusRequest(AccountStatus.BANNED));
        assertThat(target.getAccountStatus()).isEqualTo(AccountStatus.BANNED);
        assertThat(target.getTokenVersion()).isEqualTo(5);

        target.setPasswordResetTokenHash("secret");
        target.setPasswordResetTokenExpiresAt(LocalDateTime.now());
        target.setPasswordResetRequestedAt(LocalDateTime.now());
        service.deleteUser(target.getId());
        assertThat(target.getAccountStatus()).isEqualTo(AccountStatus.DELETED);
        assertThat(target.getTokenVersion()).isEqualTo(6);
        assertThat(target.getPasswordResetTokenHash()).isNull();
        assertThat(target.getPasswordResetTokenExpiresAt()).isNull();
        assertThat(target.getPasswordResetRequestedAt()).isNull();
    }

    @Test
    void immutableAdminAndNoopOrInvalidChangesConflict() {
        User admin = user(UserRole.ADMIN, AccountStatus.ACTIVE);
        when(users.findById(admin.getId())).thenReturn(Optional.of(admin));
        assertConflict(() -> service.updateStatus(admin.getId(), new AdminUserStatusRequest(AccountStatus.BANNED)));
        assertConflict(() -> service.deleteUser(admin.getId()));

        User student = user(UserRole.STUDENT, AccountStatus.ACTIVE);
        when(users.findById(student.getId())).thenReturn(Optional.of(student));
        assertConflict(() -> service.updateStatus(student.getId(), new AdminUserStatusRequest(AccountStatus.ACTIVE)));
        assertConflict(() -> service.updateStatus(student.getId(), new AdminUserStatusRequest(AccountStatus.DELETED)));

        User invalidRoleTarget = new User();
        invalidRoleTarget.setId(UUID.randomUUID());
        invalidRoleTarget.setAccountStatus(AccountStatus.ACTIVE);
        when(users.findById(invalidRoleTarget.getId())).thenReturn(Optional.of(invalidRoleTarget));
        assertConflict(() -> service.updateStatus(
                invalidRoleTarget.getId(), new AdminUserStatusRequest(AccountStatus.BANNED)));

        User deletedTarget = user(UserRole.STUDENT, AccountStatus.DELETED);
        when(users.findById(deletedTarget.getId())).thenReturn(Optional.of(deletedTarget));
        assertConflict(() -> service.updateStatus(deletedTarget.getId(), new AdminUserStatusRequest(AccountStatus.ACTIVE)));
        verify(users, never()).save(any());
    }

    @Test
    void adminResetUsesStrictServiceWithoutChangingTokenVersionAndAuditsOnlyIssuedReset() {
        User target = user(UserRole.INSTRUCTOR, AccountStatus.BANNED);
        User admin = user(UserRole.ADMIN, AccountStatus.ACTIVE);
        target.setTokenVersion(3);
        when(users.findById(target.getId())).thenReturn(Optional.of(target));
        when(currentUsers.requireCurrentUser()).thenReturn(admin);
        org.mockito.Mockito.doAnswer(invocation -> {
            target.setPasswordResetRequestedAt(LocalDateTime.now());
            return null;
        }).when(passwordResets).requestResetFor(target);

        service.requestPasswordReset(target.getId());

        assertThat(target.getTokenVersion()).isEqualTo(3);
        verify(passwordResets).requestResetFor(target);
        verify(audit).record("PASSWORD_RESET_REQUESTED", "USER", target.getId(), admin, null,
                Map.of("email", target.getEmail()));
    }

    @Test
    void adminResetRejectsAdminAndDeletedAndDoesNotAuditCooldownSuppression() {
        User adminTarget = user(UserRole.ADMIN, AccountStatus.ACTIVE);
        User deleted = user(UserRole.STUDENT, AccountStatus.DELETED);
        when(users.findById(adminTarget.getId())).thenReturn(Optional.of(adminTarget));
        when(users.findById(deleted.getId())).thenReturn(Optional.of(deleted));

        assertConflict(() -> service.requestPasswordReset(adminTarget.getId()));
        assertConflict(() -> service.requestPasswordReset(deleted.getId()));

        User coolingDown = user(UserRole.STUDENT, AccountStatus.ACTIVE);
        coolingDown.setPasswordResetRequestedAt(LocalDateTime.now());
        when(users.findById(coolingDown.getId())).thenReturn(Optional.of(coolingDown));
        service.requestPasswordReset(coolingDown.getId());

        verify(passwordResets).requestResetFor(coolingDown);
        verifyNoInteractions(audit);
    }

    @Test
    void dashboardIncludesEveryEnumValue() {
        when(users.count()).thenReturn(9L);
        when(users.countByRole()).thenReturn(List.<Object[]>of(new Object[]{UserRole.STUDENT, 5L}));
        when(users.countByAccountStatus()).thenReturn(List.<Object[]>of(new Object[]{AccountStatus.ACTIVE, 4L}));
        when(projects.countByActiveTrue()).thenReturn(3L);
        when(projects.countActiveByStatus()).thenReturn(List.<Object[]>of(new Object[]{ProjectStatus.ASSIGNED, 2L}));
        when(collectionCategories.countByActiveTrue()).thenReturn(7L);
        when(collections.countByActiveTrue()).thenReturn(6L);
        when(documents.countByActiveTrueAndDocType(DocumentType.SOURCE)).thenReturn(11L);
        when(documents.countByActiveTrueAndDocType(DocumentType.PAPER)).thenReturn(12L);
        var result = service.getDashboard();

        assertThat(result.usersByRole()).containsOnlyKeys(UserRole.values());
        assertThat(result.usersByStatus()).containsOnlyKeys(AccountStatus.values());
        assertThat(result.activeProjectsByStatus()).containsOnlyKeys(ProjectStatus.values());
        assertThat(result.usersByRole().get(UserRole.ADMIN)).isZero();
    }

    @Test
    void documentCountsUseFilteredDatabaseCounts() {
        when(documents.count(any(Specification.class))).thenReturn(1201L, 1100L, 12L);

        var result = service.getDocumentCounts("query", UUID.randomUUID(), UUID.randomUUID());

        assertThat(result).containsEntry("total", 1201L)
                .containsEntry("processed", 1100L)
                .containsEntry("failed", 12L);
    }

    @Test
    void auditLogsAreNewestFirstAndSupportActorOrCompleteEntityLookup() {
        Pageable anyPage = Pageable.ofSize(20);
        AuditLog log = new AuditLog();
        User actor = user(UserRole.ADMIN, AccountStatus.ACTIVE);
        log.setActor(actor);
        log.setAction("USER_CREATED");
        log.setEntityType("USER");
        log.setEntityId(UUID.randomUUID());
        log.setOccurredAt(LocalDateTime.now());
        when(auditLogs.findByActorIdOrderByOccurredAtDesc(eq(actor.getId()), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(log), anyPage, 1));

        var response = service.getAuditLogs(0, 20, actor.getId(), null, null);

        assertThat(response.content()).singleElement().satisfies(item -> {
            assertThat(item.actorId()).isEqualTo(actor.getId());
            assertThat(item.actorEmail()).isEqualTo(actor.getEmail());
        });
        verify(auditLogs).findByActorIdOrderByOccurredAtDesc(eq(actor.getId()), any(Pageable.class));
    }

    @Test
    void auditLogsCombineActorAndCompleteEntityFilters() {
        User actor = user(UserRole.ADMIN, AccountStatus.ACTIVE);
        UUID entityId = UUID.randomUUID();
        AuditLog combined = auditLog(actor, "COMBINED", entityId);
        when(auditLogs.findByActorIdAndEntityTypeAndEntityIdOrderByOccurredAtDesc(
                eq(actor.getId()), eq("USER"), eq(entityId), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(combined)));

        var response = service.getAuditLogs(0, 20, actor.getId(), "USER", entityId);

        assertThat(response.content()).singleElement().extracting("action").isEqualTo("COMBINED");
    }

    @Test
    void broadcastTargetsOnlyActiveRolePersistsAndPushesOncePerRecipientAndAuditsOnce() {
        User admin = user(UserRole.ADMIN, AccountStatus.ACTIVE);
        User first = user(UserRole.STUDENT, AccountStatus.ACTIVE);
        User second = user(UserRole.STUDENT, AccountStatus.ACTIVE);
        when(currentUsers.requireCurrentUser()).thenReturn(admin);
        when(users.findByAccountStatusAndRole(AccountStatus.ACTIVE, UserRole.STUDENT))
                .thenReturn(List.of(first, second));

        long count = service.broadcast(new AdminBroadcastRequest("Maintenance soon", UserRole.STUDENT, false));

        assertThat(count).isEqualTo(2);
        verify(notifications).createNotification(first, admin, "ADMIN_BROADCAST", null, "Maintenance soon");
        verify(notifications).createNotification(second, admin, "ADMIN_BROADCAST", null, "Maintenance soon");
        verify(audit).record(eq("NOTIFICATION_BROADCAST"), eq("SYSTEM_NOTIFICATION"), isNull(), eq(admin),
                isNull(), any(Map.class));
    }

    @Test
    void urgentBroadcastTargetsAllActiveUsersWithUrgentActionType() {
        User admin = user(UserRole.ADMIN, AccountStatus.ACTIVE);
        User student = user(UserRole.STUDENT, AccountStatus.ACTIVE);
        User instructor = user(UserRole.INSTRUCTOR, AccountStatus.ACTIVE);
        when(currentUsers.requireCurrentUser()).thenReturn(admin);
        when(users.findByAccountStatus(AccountStatus.ACTIVE)).thenReturn(List.of(student, instructor));

        long count = service.broadcast(new AdminBroadcastRequest("System maintenance", null, true));

        assertThat(count).isEqualTo(2);
        verify(notifications).createNotification(
                student, admin, "ADMIN_BROADCAST_URGENT", null, "System maintenance");
        verify(notifications).createNotification(
                instructor, admin, "ADMIN_BROADCAST_URGENT", null, "System maintenance");
    }

    private User user(UserRole role, AccountStatus status) {
        User user = new User();
        user.setId(UUID.randomUUID());
        user.setEmail(role.name().toLowerCase() + "-" + UUID.randomUUID() + "@test.com");
        user.setRole(role);
        user.setAccountStatus(status);
        user.setPasswordHash("hash");
        return user;
    }

    private AuditLog auditLog(User actor, String action, UUID entityId) {
        AuditLog log = new AuditLog();
        log.setActor(actor);
        log.setAction(action);
        log.setEntityType("USER");
        log.setEntityId(entityId);
        log.setOccurredAt(LocalDateTime.now());
        return log;
    }

    private void assertConflict(Runnable action) {
        assertThatThrownBy(action::run)
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(((ResponseStatusException) error).getStatusCode().value()).isEqualTo(409));
    }

    private void assertBadRequest(Runnable action) {
        assertThatThrownBy(action::run)
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(((ResponseStatusException) error).getStatusCode().value()).isEqualTo(400));
    }
}
