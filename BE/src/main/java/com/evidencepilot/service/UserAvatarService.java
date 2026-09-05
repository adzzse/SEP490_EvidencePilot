package com.evidencepilot.service;

import java.util.UUID;

import org.springframework.web.multipart.MultipartFile;

public interface UserAvatarService {

    /**
     * Stores the uploaded image in MinIO under {@code avatars/{userId}.jpg},
     * persists the object key on the user, and returns a short-lived
     * presigned GET URL.
     */
    String uploadAvatar(UUID userId, MultipartFile file);

    /**
     * Best-effort presigned URL for the user's avatar key, or null when the
     * user has no avatar or storage is unavailable. Never throws.
     */
    String resolveAvatarUrl(com.evidencepilot.model.User user);
}
