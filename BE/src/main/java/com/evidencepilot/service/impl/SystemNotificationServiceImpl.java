package com.evidencepilot.service.impl;

import com.evidencepilot.dto.response.SystemNotificationResponse;
import com.evidencepilot.model.SystemNotification;
import com.evidencepilot.model.User;
import com.evidencepilot.repository.SystemNotificationRepository;
import com.evidencepilot.service.CurrentUserService;
import com.evidencepilot.service.SystemNotificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class SystemNotificationServiceImpl implements SystemNotificationService {

    private static final String USER_NOTIFICATION_DESTINATION = "/queue/notifications";

    private final SystemNotificationRepository systemNotificationRepository;
    private final CurrentUserService currentUserService;
    private final SimpMessagingTemplate messagingTemplate;

    @Override
    public List<SystemNotificationResponse> getCurrentUserNotifications() {
        User currentUser = currentUserService.requireCurrentUser();
        return systemNotificationRepository.findByUserIdOrderByCreatedAtDesc(currentUser.getId()).stream()
                .map(SystemNotificationResponse::from)
                .toList();
    }

    @Override
    public long countCurrentUserUnreadNotifications() {
        User currentUser = currentUserService.requireCurrentUser();
        return systemNotificationRepository.countByUserIdAndReadFalse(currentUser.getId());
    }

    @Override
    @Transactional
    public Optional<SystemNotificationResponse> markCurrentUserNotificationRead(UUID notificationId) {
        User currentUser = currentUserService.requireCurrentUser();
        return systemNotificationRepository.findByIdAndUserId(notificationId, currentUser.getId())
                .map(notification -> {
                    notification.setRead(true);
                    return SystemNotificationResponse.from(systemNotificationRepository.save(notification));
                });
    }

    @Override
    @Transactional
    public SystemNotificationResponse createNotification(
            User recipient,
            User actor,
            String actionType,
            UUID entityId,
            UUID feedbackId,
            String message) {
        SystemNotification notification = new SystemNotification();
        notification.setUser(recipient);
        notification.setActor(actor);
        notification.setActionType(actionType);
        notification.setEntityId(entityId);
        notification.setFeedbackId(feedbackId);
        notification.setMessage(message);
        notification.setRead(false);
        notification.setCreatedAt(LocalDateTime.now());

        SystemNotificationResponse response =
                SystemNotificationResponse.from(systemNotificationRepository.save(notification));
        Runnable push = () -> messagingTemplate.convertAndSendToUser(
                recipient.getId().toString(), USER_NOTIFICATION_DESTINATION, response);
        if (TransactionSynchronizationManager.isActualTransactionActive()
                && TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    push.run();
                }
            });
        } else {
            push.run();
        }
        return response;
    }
}
