package com.evidencepilot.controller;

import com.evidencepilot.dto.response.SystemNotificationResponse;
import com.evidencepilot.dto.response.SystemNotificationUnreadCountResponse;
import com.evidencepilot.service.SystemNotificationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/notifications")
@RequiredArgsConstructor
@Tag(name = "System Notifications", description = "In-app notification inbox and read state")
public class SystemNotificationController {

    private final SystemNotificationService systemNotificationService;

    @Operation(summary = "List current user's notifications")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Notification list returned"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT")
    })
    @GetMapping
    public List<SystemNotificationResponse> getNotifications() {
        return systemNotificationService.getCurrentUserNotifications();
    }

    @Operation(summary = "Count current user's unread notifications")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Unread count returned"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT")
    })
    @GetMapping("/unread-count")
    public SystemNotificationUnreadCountResponse countUnread() {
        return new SystemNotificationUnreadCountResponse(
                systemNotificationService.countCurrentUserUnreadNotifications());
    }

    @Operation(summary = "Mark all current user's notifications as read")
    @PatchMapping("/read-all")
    public SystemNotificationUnreadCountResponse markAllRead() {
        return new SystemNotificationUnreadCountResponse(
                systemNotificationService.markAllCurrentUserNotificationsRead());
    }

    @Operation(summary = "Mark one notification as read")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Notification marked read"),
            @ApiResponse(responseCode = "401", description = "Missing or invalid JWT"),
            @ApiResponse(responseCode = "404", description = "Notification not found")
    })
    @PatchMapping("/{id}/read")
    public SystemNotificationResponse markRead(@PathVariable UUID id) {
        return systemNotificationService.markCurrentUserNotificationRead(id)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Notification not found: " + id));
    }
}
