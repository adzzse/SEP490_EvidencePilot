package com.evidencepilot.service;

import com.evidencepilot.model.ProjectMedia;
import com.evidencepilot.repository.ProjectMediaRepository;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TexArchiveMediaWriterTest {

    private final ProjectMediaRepository repository = mock(ProjectMediaRepository.class);
    private final DocumentObjectStorage storage = mock(DocumentObjectStorage.class);
    private final TexArchiveMediaWriter writer = new TexArchiveMediaWriter(repository, storage);

    @Test
    void writesMediaAtItsExactTexFilename() throws Exception {
        UUID projectId = UUID.randomUUID();
        ProjectMedia media = media("images/figure.jpg", "media/project/extracted/source/images/figure.jpg");
        when(repository.findByProjectIdOrderByIdAsc(projectId)).thenReturn(List.of(media));
        when(storage.getStream(media.getStorageKey()))
                .thenReturn(new ByteArrayInputStream(new byte[] {1, 2, 3}));

        var bytes = new ByteArrayOutputStream();
        try (var zip = new ZipOutputStream(bytes, StandardCharsets.UTF_8)) {
            writer.writeProjectMedia(projectId, zip);
        }

        try (var zip = new ZipInputStream(
                new ByteArrayInputStream(bytes.toByteArray()),
                StandardCharsets.UTF_8)) {
            assertThat(zip.getNextEntry().getName()).isEqualTo("images/figure.jpg");
            assertThat(zip.readAllBytes()).containsExactly(1, 2, 3);
            assertThat(zip.getNextEntry()).isNull();
        }
    }

    @Test
    void skipsUnsafeAndDuplicateTexFilenamesDeterministically() throws Exception {
        UUID projectId = UUID.randomUUID();
        ProjectMedia unsafe = media("../escape.jpg", "unsafe");
        ProjectMedia first = media("images/figure.jpg", "first");
        ProjectMedia duplicate = media("images/figure.jpg", "duplicate");
        when(repository.findByProjectIdOrderByIdAsc(projectId)).thenReturn(List.of(unsafe, first, duplicate));
        when(storage.getStream("first")).thenReturn(new ByteArrayInputStream(new byte[] {1}));

        var bytes = new ByteArrayOutputStream();
        try (var zip = new ZipOutputStream(bytes, StandardCharsets.UTF_8)) {
            writer.writeProjectMedia(projectId, zip);
        }

        try (var zip = new ZipInputStream(
                new ByteArrayInputStream(bytes.toByteArray()),
                StandardCharsets.UTF_8)) {
            assertThat(zip.getNextEntry().getName()).isEqualTo("images/figure.jpg");
            assertThat(zip.readAllBytes()).containsExactly(1);
            assertThat(zip.getNextEntry()).isNull();
        }
        verify(storage, never()).getStream("unsafe");
        verify(storage, never()).getStream("duplicate");
    }

    @Test
    void usesStableIdOrderForDuplicateWinner() throws Exception {
        UUID projectId = UUID.randomUUID();
        ProjectMedia lowerId = media("images/figure.jpg", "lower-id");
        lowerId.setId(UUID.fromString("00000000-0000-0000-0000-000000000001"));
        ProjectMedia higherId = media("images/figure.jpg", "higher-id");
        higherId.setId(UUID.fromString("00000000-0000-0000-0000-000000000002"));
        when(repository.findByProjectIdOrderByIdAsc(projectId))
                .thenReturn(List.of(lowerId, higherId));
        when(storage.getStream("lower-id"))
                .thenReturn(new ByteArrayInputStream(new byte[] {1}));

        var bytes = new ByteArrayOutputStream();
        try (var zip = new ZipOutputStream(bytes, StandardCharsets.UTF_8)) {
            writer.writeProjectMedia(projectId, zip);
        }

        try (var zip = new ZipInputStream(
                new ByteArrayInputStream(bytes.toByteArray()),
                StandardCharsets.UTF_8)) {
            assertThat(zip.getNextEntry().getName()).isEqualTo("images/figure.jpg");
            assertThat(zip.readAllBytes()).containsExactly(1);
            assertThat(zip.getNextEntry()).isNull();
        }
        verify(repository).findByProjectIdOrderByIdAsc(projectId);
        verify(storage, never()).getStream("higher-id");
    }

    private static ProjectMedia media(String texFilename, String storageKey) {
        ProjectMedia media = new ProjectMedia();
        media.setId(UUID.randomUUID());
        media.setTexFilename(texFilename);
        media.setStorageKey(storageKey);
        return media;
    }
}
