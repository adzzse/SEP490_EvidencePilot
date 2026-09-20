package com.evidencepilot.service;

import com.evidencepilot.service.impl.CurrentUserServiceImpl;
import com.evidencepilot.dto.response.SystemNotificationResponse;
import com.evidencepilot.model.SystemNotification;
import com.evidencepilot.model.User;
import com.evidencepilot.repository.SystemNotificationRepository;
import com.evidencepilot.service.impl.SystemNotificationServiceImpl;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SystemNotificationServiceImplTest {

    @Mock
    private SystemNotificationRepository systemNotificationRepository;

    @Mock
    private CurrentUserServiceImpl currentUserService;

    @Mock
    private SimpMessagingTemplate messagingTemplate;

    @InjectMocks
    private SystemNotificationServiceImpl service;

    @Test
    void getCurrentUserNotificationsReturnsRepositoryOrder() {
        User user = user(UUID.randomUUID());
        SystemNotification notification = notification(UUID.randomUUID(), user, false);
        when(currentUserService.requireCurrentUser()).thenReturn(user);
        when(systemNotificationRepository.findByUserIdOrderByCreatedAtDesc(user.getId()))
                .thenReturn(List.of(notification));

        assertThat(service.getCurrentUserNotifications()).singleElement()
                .extracting(SystemNotificationResponse::id).isEqualTo(notification.getId());
    }

    @Test
    void countCurrentUserUnreadNotificationsUsesCurrentUserId() {
        User user = user(UUID.randomUUID());
        when(currentUserService.requireCurrentUser()).thenReturn(user);
        when(systemNotificationRepository.countByUserIdAndReadFalse(user.getId())).thenReturn(4L);

        assertThat(service.countCurrentUserUnreadNotifications()).isEqualTo(4L);
    }

    @Test
    void markAllCurrentUserNotificationsReadUsesOneOwnedBulkUpdate() {
        UUID currentUserId = UUID.randomUUID();
        when(currentUserService.requireCurrentUser()).thenReturn(user(currentUserId));
        when(systemNotificationRepository.markAllUnreadByUserId(currentUserId)).thenReturn(3);

        assertThat(service.markAllCurrentUserNotificationsRead()).isEqualTo(3L);
        verify(systemNotificationRepository).markAllUnreadByUserId(currentUserId);
    }

    @Test
    void createNotificationPersistsAndPushesToUserQueue() {
        UUID recipientId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        UUID entityId = UUID.randomUUID();
        User recipient = user(recipientId);
        User actor = user(actorId);

        when(systemNotificationRepository.save(any(SystemNotification.class))).thenAnswer(invocation -> {
            SystemNotification notification = invocation.getArgument(0);
            notification.setId(UUID.randomUUID());
            return notification;
        });

        SystemNotificationResponse response = service.createNotification(
                recipient,
                actor,
                "REVIEW_SUBMITTED",
                entityId,
                "Project submitted for review.");

        ArgumentCaptor<SystemNotification> notificationCaptor =
                ArgumentCaptor.forClass(SystemNotification.class);
        verify(systemNotificationRepository).save(notificationCaptor.capture());
        SystemNotification saved = notificationCaptor.getValue();
        assertThat(saved.getUser()).isSameAs(recipient);
        assertThat(saved.getActor()).isSameAs(actor);
        assertThat(saved.getActionType()).isEqualTo("REVIEW_SUBMITTED");
        assertThat(saved.getEntityId()).isEqualTo(entityId);
        assertThat(saved.getMessage()).isEqualTo("Project submitted for review.");
        assertThat(saved.isRead()).isFalse();
        assertThat(saved.getCreatedAt()).isNotNull();

        assertThat(response.userId()).isEqualTo(recipientId);
        assertThat(response.actorId()).isEqualTo(actorId);
        assertThat(response.actionType()).isEqualTo("REVIEW_SUBMITTED");

        verify(messagingTemplate).convertAndSendToUser(
                eq(recipientId.toString()),
                eq("/queue/notifications"),
                any(SystemNotificationResponse.class));
    }

    @Test
    void markCurrentUserNotificationReadRejectsOtherUsersNotification() {
        UUID notificationId = UUID.randomUUID();
        UUID currentUserId = UUID.randomUUID();
        when(currentUserService.requireCurrentUser()).thenReturn(user(currentUserId));
        when(systemNotificationRepository.findByIdAndUserId(notificationId, currentUserId))
                .thenReturn(Optional.empty());

        Optional<SystemNotificationResponse> response =
                service.markCurrentUserNotificationRead(notificationId);

        assertThat(response).isEmpty();
    }

    @Test
    void markCurrentUserNotificationReadUpdatesOwnedNotification() {
        UUID notificationId = UUID.randomUUID();
        UUID currentUserId = UUID.randomUUID();
        User currentUser = user(currentUserId);
        SystemNotification notification = new SystemNotification();
        notification.setId(notificationId);
        notification.setUser(currentUser);
        notification.setActionType("DOCUMENT_PROCESSING_COMPLETED");
        notification.setEntityId(UUID.randomUUID());
        notification.setMessage("Document processing completed.");
        notification.setCreatedAt(LocalDateTime.now());
        notification.setRead(false);

        when(currentUserService.requireCurrentUser()).thenReturn(currentUser);
        when(systemNotificationRepository.findByIdAndUserId(notificationId, currentUserId))
                .thenReturn(Optional.of(notification));
        when(systemNotificationRepository.save(notification)).thenReturn(notification);

        Optional<SystemNotificationResponse> response =
                service.markCurrentUserNotificationRead(notificationId);

        assertThat(response).isPresent();
        assertThat(response.orElseThrow().read()).isTrue();
        verify(systemNotificationRepository).save(notification);
    }

    private User user(UUID id) {
        User user = new User();
        user.setId(id);
        user.setEmail(id + "@example.com");
        return user;
    }

    private SystemNotification notification(UUID id, User user, boolean read) {
        SystemNotification notification = new SystemNotification();
        notification.setId(id);
        notification.setUser(user);
        notification.setActionType("TEST");
        notification.setEntityId(UUID.randomUUID());
        notification.setMessage("message");
        notification.setCreatedAt(LocalDateTime.now());
        notification.setRead(read);
        return notification;
    }
}
