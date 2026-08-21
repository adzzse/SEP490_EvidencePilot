package com.evidencepilot.service;

import com.evidencepilot.model.Document;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.ProjectMedia;
import com.evidencepilot.model.User;
import com.evidencepilot.repository.ProjectMediaRepository;
import com.evidencepilot.repository.ProjectRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class MediaAssetServiceTest {

    @Mock
    private ProjectMediaRepository projectMediaRepository;
    @Mock
    private ProjectRepository projectRepository;
    @Mock
    private DocumentObjectStorage objectStorage;
    @Mock
    private CurrentUserService currentUserService;

    @Test
    void importExtractedImageUsesStableStorageKeyAndTexPath() {
        Document source = sourceDocument();
        String texFilename = "images/figure.jpg";
        String storageKey = "media/" + source.getProject().getId()
                + "/extracted/" + source.getId() + "/" + texFilename;
        when(projectMediaRepository.existsByProjectIdAndStorageKey(
                source.getProject().getId(), storageKey)).thenReturn(false);

        service().importExtractedImage(
                source,
                texFilename,
                new ByteArrayInputStream(new byte[] {1, 2, 3}),
                3,
                "image/jpeg");

        verify(objectStorage).write(
                eq(storageKey),
                any(InputStream.class),
                eq(3L),
                eq("image/jpeg"));
        verify(projectMediaRepository).saveAndFlush(argThat(media ->
                media.getProject() == source.getProject()
                        && media.getUploadedBy() == source.getUploadedBy()
                        && media.getStorageKey().equals(storageKey)
                        && media.getTexFilename().equals(texFilename)));
    }

    @Test
    void importExtractedImageSkipsAnExistingStorageKey() {
        Document source = sourceDocument();
        String texFilename = "images/figure.jpg";
        String storageKey = "media/" + source.getProject().getId()
                + "/extracted/" + source.getId() + "/" + texFilename;
        when(projectMediaRepository.existsByProjectIdAndStorageKey(
                source.getProject().getId(), storageKey)).thenReturn(true);

        service().importExtractedImage(
                source,
                texFilename,
                new ByteArrayInputStream(new byte[] {1, 2, 3}),
                3,
                "image/jpeg");

        verify(objectStorage, never()).write(any(), any(InputStream.class), any(Long.class), any());
        verify(projectMediaRepository, never()).saveAndFlush(any());
    }

    @Test
    void importFailureKeepsObjectWhenAnotherRowNowReferencesIt() {
        Document source = sourceDocument();
        String texFilename = "images/figure.jpg";
        String storageKey = "media/" + source.getProject().getId()
                + "/extracted/" + source.getId() + "/" + texFilename;
        when(projectMediaRepository.existsByProjectIdAndStorageKey(
                source.getProject().getId(), storageKey)).thenReturn(false, true);
        when(projectMediaRepository.saveAndFlush(any())).thenThrow(new RuntimeException("duplicate"));

        assertThrows(RuntimeException.class, () -> service().importExtractedImage(
                source,
                texFilename,
                new ByteArrayInputStream(new byte[] {1, 2, 3}),
                3,
                "image/jpeg"));

        verify(objectStorage, never()).delete(storageKey);
    }

    @Test
    void uploadDeletesObjectWhenDatabaseWriteFails() {
        Project project = project(UUID.randomUUID());
        when(currentUserService.requireCurrentUser()).thenReturn(new User());
        when(projectRepository.findById(project.getId())).thenReturn(Optional.of(project));
        when(projectMediaRepository.saveAndFlush(any())).thenThrow(new RuntimeException("db offline"));
        MockMultipartFile file = new MockMultipartFile(
                "file", "figure.png", "image/png", new byte[] {1, 2, 3});

        assertThrows(RuntimeException.class, () -> service().upload(file, project.getId()));

        verify(objectStorage).delete(argThat(key -> key.startsWith("media/" + project.getId() + "/")));
    }

    @Test
    void deleteRemovesDatabaseRowAndStoredObject() {
        UUID mediaId = UUID.randomUUID();
        User user = new User();
        ProjectMedia media = new ProjectMedia();
        media.setId(mediaId);
        media.setProject(project(UUID.randomUUID()));
        media.setStorageKey("media/file.png");
        when(currentUserService.requireCurrentUser()).thenReturn(user);
        when(projectMediaRepository.findById(mediaId)).thenReturn(Optional.of(media));

        service().delete(mediaId);

        verify(projectMediaRepository).delete(media);
        verify(projectMediaRepository).flush();
        verify(objectStorage).delete("media/file.png");
    }

    @Test
    void deleteExtractedForDocumentRemovesOnlyItsDerivedMedia() {
        Document source = sourceDocument();
        ProjectMedia media = new ProjectMedia();
        media.setStorageKey("media/" + source.getProject().getId()
                + "/extracted/" + source.getId() + "/figure.png");
        when(projectMediaRepository.findByStorageKeyStartingWith(any())).thenReturn(List.of(media));

        service().deleteExtractedForDocument(source);

        verify(projectMediaRepository).deleteAll(List.of(media));
        verify(projectMediaRepository).flush();
        verify(objectStorage).delete(media.getStorageKey());
    }

    @Test
    void listByProject_requiresProjectAccess() {
        UUID projectId = UUID.randomUUID();
        when(projectRepository.findById(projectId))
                .thenReturn(Optional.of(project(projectId)));
        doThrow(new ResponseStatusException(HttpStatus.FORBIDDEN, "denied"))
                .when(currentUserService).requireProjectAccess(any(), any());

        assertThrows(ResponseStatusException.class,
                () -> service().listByProject(projectId));
        verify(projectMediaRepository, never()).findByProjectId(any());
    }

    @Test
    void getSignedUrl_requiresProjectAccess() {
        UUID mediaId = UUID.randomUUID();
        ProjectMedia media = new ProjectMedia();
        media.setId(mediaId);
        media.setProject(project(UUID.randomUUID()));
        when(projectMediaRepository.findById(mediaId)).thenReturn(Optional.of(media));
        doThrow(new ResponseStatusException(HttpStatus.FORBIDDEN, "denied"))
                .when(currentUserService).requireProjectAccess(any(), any());

        assertThrows(ResponseStatusException.class,
                () -> service().getSignedUrl(mediaId));
        verify(objectStorage, never()).presignedGetUrl(any(), any(Integer.class));
    }

    @Test
    void getSignedUrlsBatchesPresignsAndChecksAccessOncePerProject() {
        Project project = project(UUID.randomUUID());
        ProjectMedia first = new ProjectMedia();
        first.setId(UUID.randomUUID());
        first.setProject(project);
        first.setStorageKey("media/a");
        ProjectMedia second = new ProjectMedia();
        second.setId(UUID.randomUUID());
        second.setProject(project);
        second.setStorageKey("media/b");
        when(projectMediaRepository.findAllById(List.of(first.getId(), second.getId())))
                .thenReturn(List.of(first, second));
        when(objectStorage.presignedGetUrl("media/a", 60)).thenReturn("https://a");
        when(objectStorage.presignedGetUrl("media/b", 60)).thenReturn("https://b");

        Map<UUID, String> urls = service().getSignedUrls(List.of(first.getId(), second.getId()));

        assertThat(urls).containsEntry(first.getId(), "https://a")
                .containsEntry(second.getId(), "https://b");
        verify(currentUserService, times(1)).requireProjectAccess(any(), eq(project));
    }

    @Test
    void getSignedUrlsSkipsUnknownIdsAndHandlesEmpty() {
        assertThat(service().getSignedUrls(null)).isEmpty();
        assertThat(service().getSignedUrls(List.of())).isEmpty();
    }

    private static Project project(UUID id) {
        Project p = new Project();
        p.setId(id);
        return p;
    }

    private MediaAssetService service() {
        return new MediaAssetService(
                projectMediaRepository, projectRepository, objectStorage, currentUserService);
    }

    private static Document sourceDocument() {
        Project project = new Project();
        project.setId(UUID.randomUUID());
        User user = new User();
        user.setId(UUID.randomUUID());
        Document source = new Document();
        source.setId(UUID.randomUUID());
        source.setProject(project);
        source.setUploadedBy(user);
        return source;
    }
}
