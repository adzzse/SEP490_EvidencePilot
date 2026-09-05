package com.evidencepilot.service.impl;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.server.ResponseStatusException;

import com.evidencepilot.exception.ResourceNotFoundException;
import com.evidencepilot.model.User;
import com.evidencepilot.repository.UserRepository;
import com.evidencepilot.service.DocumentObjectStorage;

class UserAvatarServiceImplTest {

    private final UserRepository users = mock(UserRepository.class);
    private final DocumentObjectStorage storage = mock(DocumentObjectStorage.class);
    private final UserAvatarServiceImpl service = new UserAvatarServiceImpl(users, storage);

    private User user() {
        User u = new User();
        u.setId(UUID.randomUUID());
        u.setEmail("u@example.com");
        return u;
    }

    @Test
    void uploadAvatar_storesKeyAndReturnsSignedUrl() throws IOException {
        User u = user();
        when(users.findById(u.getId())).thenReturn(Optional.of(u));
        when(storage.presignedGetUrl("avatars/" + u.getId() + ".jpg", 60))
                .thenReturn("https://cdn.example/avatars/x.jpg");

        MockMultipartFile file = new MockMultipartFile("file", "me.png", "image/png", new byte[]{1, 2, 3});
        String url = service.uploadAvatar(u.getId(), file);

        assertThat(url).isEqualTo("https://cdn.example/avatars/x.jpg");
        // ponytail: key only in DB — never a URL.
        assertThat(u.getAvatarKey()).isEqualTo("avatars/" + u.getId() + ".jpg");
        verify(users).save(u);
    }

    @Test
    void uploadAvatar_rejectsNonImage() {
        User u = user();
        MockMultipartFile file = new MockMultipartFile("file", "evil.pdf", "application/pdf", new byte[]{1});

        assertThatThrownBy(() -> service.uploadAvatar(u.getId(), file))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Only image");
    }

    @Test
    void uploadAvatar_rejectsOversize() {
        User u = user();
        byte[] big = new byte[(int) (5L * 1024 * 1024) + 1];
        MockMultipartFile file = new MockMultipartFile("file", "big.jpg", "image/jpeg", big);

        assertThatThrownBy(() -> service.uploadAvatar(u.getId(), file))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("5MB");
    }

    @Test
    void uploadAvatar_rejectsMissingUser() {
        UUID id = UUID.randomUUID();
        when(users.findById(id)).thenReturn(Optional.empty());
        MockMultipartFile file = new MockMultipartFile("file", "me.jpg", "image/jpeg", new byte[]{1});

        assertThatThrownBy(() -> service.uploadAvatar(id, file))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void resolveAvatarUrl_nullWhenNoKey() {
        assertThat(service.resolveAvatarUrl(user())).isNull();
        assertThat(service.resolveAvatarUrl(null)).isNull();
    }

    @Test
    void resolveAvatarUrl_nullWhenStorageFails() {
        User u = user();
        u.setAvatarKey("avatars/" + u.getId() + ".jpg");
        when(storage.presignedGetUrl(anyString(), anyInt())).thenThrow(new RuntimeException("minio down"));

        assertThat(service.resolveAvatarUrl(u)).isNull();
    }
}
