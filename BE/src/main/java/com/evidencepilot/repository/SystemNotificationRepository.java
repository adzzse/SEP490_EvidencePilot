package com.evidencepilot.repository;

import com.evidencepilot.model.SystemNotification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SystemNotificationRepository extends JpaRepository<SystemNotification, UUID> {
    List<SystemNotification> findByUserIdOrderByCreatedAtDesc(UUID userId);
    Optional<SystemNotification> findByIdAndUserId(UUID id, UUID userId);
    long countByUserIdAndReadFalse(UUID userId);

    @Modifying
    @Query("update SystemNotification n set n.read = true where n.user.id = :userId and n.read = false")
    int markAllUnreadByUserId(@Param("userId") UUID userId);
}
