package com.evidencepilot.controller;

import com.evidencepilot.dto.response.SystemNotificationResponse;
import com.evidencepilot.service.SystemNotificationService;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.hamcrest.Matchers.is;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class SystemNotificationControllerTest {

    private final SystemNotificationService systemNotificationService = mock(SystemNotificationService.class);
    private final MockMvc mockMvc = MockMvcBuilders
            .standaloneSetup(new SystemNotificationController(systemNotificationService))
            .build();

    @Test
    void getNotificationsReturnsCurrentUsersNotifications() throws Exception {
        UUID notificationId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        when(systemNotificationService.getCurrentUserNotifications()).thenReturn(List.of(
                new SystemNotificationResponse(
                        notificationId,
                        userId,
                        null,
                        "DOCUMENT_PROCESSING_COMPLETED",
                        UUID.randomUUID(),
                        "Document processing completed.",
                        false,
                        null)));

        mockMvc.perform(get("/api/notifications")
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id", is(notificationId.toString())))
                .andExpect(jsonPath("$[0].userId", is(userId.toString())))
                .andExpect(jsonPath("$[0].actionType", is("DOCUMENT_PROCESSING_COMPLETED")))
                .andExpect(jsonPath("$[0].read", is(false)));
    }

    @Test
    void unreadCountReturnsCurrentUsersCount() throws Exception {
        when(systemNotificationService.countCurrentUserUnreadNotifications()).thenReturn(3L);

        mockMvc.perform(get("/api/notifications/unread-count"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.count", is(3)));

        verify(systemNotificationService).countCurrentUserUnreadNotifications();
    }

    @Test
    void markReadReturnsNotFoundWhenNotificationIsNotOwnedByCurrentUser() throws Exception {
        UUID notificationId = UUID.randomUUID();
        when(systemNotificationService.markCurrentUserNotificationRead(notificationId))
                .thenReturn(Optional.empty());

        mockMvc.perform(patch("/api/notifications/{id}/read", notificationId))
                .andExpect(status().isNotFound());
    }

    @Test
    void markReadReturnsUpdatedNotification() throws Exception {
        UUID notificationId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        when(systemNotificationService.markCurrentUserNotificationRead(notificationId))
                .thenReturn(Optional.of(new SystemNotificationResponse(
                        notificationId,
                        userId,
                        null,
                        "REVIEW_STATUS_CHANGED",
                        UUID.randomUUID(),
                        "Review status changed.",
                        true,
                        null)));

        mockMvc.perform(patch("/api/notifications/{id}/read", notificationId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id", is(notificationId.toString())))
                .andExpect(jsonPath("$.read", is(true)));

        verify(systemNotificationService).markCurrentUserNotificationRead(notificationId);
    }
}
