package com.evidencepilot.service;

import com.evidencepilot.dto.response.SystemNotificationResponse;
import com.evidencepilot.model.User;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SystemNotificationService {
    List<SystemNotificationResponse> getCurrentUserNotifications();
    long countCurrentUserUnreadNotifications();
    Optional<SystemNotificationResponse> markCurrentUserNotificationRead(UUID notificationId);
    default SystemNotificationResponse createNotification(
            User recipient,
            User actor,
            String actionType,
            UUID entityId,
            String message) {
        return createNotification(recipient, actor, actionType, entityId, null, message);
    }
    SystemNotificationResponse createNotification(
            User recipient,
            User actor,
            String actionType,
            UUID entityId,
            UUID feedbackId,
            String message);
}
