package com.evidencepilot.service.impl;

import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import com.evidencepilot.exception.ResourceNotFoundException;
import com.evidencepilot.model.User;
import com.evidencepilot.repository.UserRepository;
import com.evidencepilot.service.DocumentObjectStorage;
import com.evidencepilot.service.UserAvatarService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Service
@RequiredArgsConstructor
@Slf4j
public class UserAvatarServiceImpl implements UserAvatarService {

    private static final long MAX_BYTES = 5L * 1024 * 1024;

    private final UserRepository userRepository;
    private final DocumentObjectStorage objectStorage;

    @Override
    @Transactional
    public String uploadAvatar(UUID userId, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "An image file is required");
        }
        String contentType = file.getContentType();
        if (contentType == null || !contentType.toLowerCase().startsWith("image/")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only image files are allowed");
        }
        if (file.getSize() > MAX_BYTES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Image must not exceed 5MB");
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException(userId, "User"));

        String key = "avatars/" + userId + ".jpg";
        try {
            objectStorage.write(key, file.getInputStream(), file.getSize(), contentType);
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Avatar upload failed. Please try again later.", e);
        }

        user.setAvatarKey(key);
        userRepository.save(user);
        return resolveAvatarUrl(user);
    }

    @Override
    public String resolveAvatarUrl(User user) {
        if (user == null || user.getAvatarKey() == null || user.getAvatarKey().isBlank()) {
            return null;
        }
        try {
            return objectStorage.presignedGetUrl(user.getAvatarKey(), 60);
        } catch (Exception e) {
            log.warn("Failed to sign avatar URL for user {}", user.getId(), e);
            return null;
        }
    }
}
