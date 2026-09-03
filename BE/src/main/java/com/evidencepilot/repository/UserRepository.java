package com.evidencepilot.repository;

import com.evidencepilot.model.User;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.Collection;
import java.util.Optional;
import java.util.List;
import java.util.UUID;
import com.evidencepilot.model.enums.AccountStatus;
import com.evidencepilot.model.enums.UserRole;

public interface UserRepository extends JpaRepository<User, UUID>, JpaSpecificationExecutor<User> {
    // soft-deleted accounts are invisible to login, lookup, and duplicate checks
    @Query("select user from User user where user.email = :email and user.accountStatus <> 'DELETED'")
    Optional<User> findByEmail(@Param("email") String email);

    @Query("select user from User user where lower(user.email) in :emails and user.accountStatus <> 'DELETED'")
    List<User> findAllByEmailIn(@Param("emails") Collection<String> emails);

    @Query("select user from User user where upper(user.studentCode) = :studentCode and user.accountStatus <> 'DELETED'")
    Optional<User> findByStudentCode(@Param("studentCode") String studentCode);

    @Query("select user from User user where upper(user.studentCode) in :studentCodes and user.accountStatus <> 'DELETED'")
    List<User> findAllByStudentCodeIn(@Param("studentCodes") Collection<String> studentCodes);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update User user set user.passwordChangeNoticePending = false "
            + "where user.id = :id and user.passwordChangeNoticePending = true")
    int consumePasswordChangeNotice(@Param("id") UUID id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select user from User user where user.email = :email and user.accountStatus <> 'DELETED'")
    Optional<User> findByEmailForPasswordReset(@Param("email") String email);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select user from User user where user.id = :id")
    Optional<User> findByIdForPasswordReset(@Param("id") UUID id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select user from User user where user.passwordResetTokenHash = :tokenHash")
    Optional<User> findByPasswordResetTokenHashForUpdate(@Param("tokenHash") String tokenHash);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select user from User user where user.emailVerificationTokenHash = :tokenHash")
    Optional<User> findByEmailVerificationTokenHashForUpdate(@Param("tokenHash") String tokenHash);

    @Query("select case when count(user) > 0 then true else false end "
            + "from User user where lower(user.email) = lower(:email) and user.accountStatus <> 'DELETED'")
    boolean existsByEmailIgnoreCase(@Param("email") String email);

    List<User> findByAccountStatus(AccountStatus status);

    List<User> findByAccountStatusAndRole(AccountStatus status, UserRole role);

    List<User> findByRole(UserRole role);

    @Query("select u from User u where u.role = :role and (lower(u.firstName) like lower(concat('%', :q, '%')) or lower(u.lastName) like lower(concat('%', :q, '%')) or lower(u.email) like lower(concat('%', :q, '%')))")
    List<User> searchByRole(@Param("role") UserRole role, @Param("q") String q);

    @Query("select user.role, count(user) from User user group by user.role")
    List<Object[]> countByRole();

    @Query("select user.accountStatus, count(user) from User user group by user.accountStatus")
    List<Object[]> countByAccountStatus();
}
