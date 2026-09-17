package com.evidencepilot.service;

import com.evidencepilot.model.FeedbackAttachment;
import com.evidencepilot.model.FeedbackReply;
import com.evidencepilot.model.InstructorFeedback;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.ProjectMedia;
import com.evidencepilot.model.ProjectMember;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.AccountStatus;
import com.evidencepilot.model.enums.ProjectRole;
import com.evidencepilot.model.enums.ProjectStatus;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.FeedbackAttachmentRepository;
import com.evidencepilot.repository.ProjectMediaRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class FeedbackAttachmentServiceTest {

    @Mock private FeedbackAttachmentRepository attachmentRepository;
    @Mock private ProjectMediaRepository projectMediaRepository;
    @Mock private DocumentObjectStorage objectStorage;

    @Test
    void linkRejectsForeignNonImageAndOverLimit() {
        User student = user(UserRole.STUDENT);
        Project project = project(student, ProjectStatus.RETURNED);
        InstructorFeedback thread = thread();
        ProjectMedia foreignRow = media(project(user(UserRole.STUDENT), ProjectStatus.RETURNED), "image/png", 100L);
        ProjectMedia pdfRow = media(project, "application/pdf", 100L);

        when(projectMediaRepository.findAllById(any())).thenAnswer(invocation -> {
            List<UUID> ids = invocation.getArgument(0);
            return ids.stream().map(id -> {
                if (id.equals(foreignRow.getId())) return foreignRow;
                return pdfRow;
            }).toList();
        });
        when(attachmentRepository.findByFeedbackId(thread.getId())).thenReturn(List.of());

        assertThatThrownBy(() -> service().linkMediaAssets(
                List.of(foreignRow.getId()), project, student, thread, null))
                .hasMessageContaining("does not belong to this project");
        assertThatThrownBy(() -> service().linkMediaAssets(
                List.of(pdfRow.getId()), project, student, thread, null))
                .hasMessageContaining("Only PNG, JPEG, GIF or WebP");
        assertThatThrownBy(() -> service().linkMediaAssets(
                List.of(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                        UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID()),
                project, student, thread, null))
                .hasMessageContaining("At most 5");
        verify(attachmentRepository, never()).save(any());
    }

    @Test
    void linkClonesBytesAndSeversLibraryTie() {
        User instructor = user(UserRole.INSTRUCTOR);
        Project project = project(instructor, ProjectStatus.RETURNED);
        InstructorFeedback thread = thread();
        ProjectMedia asset = media(project, "image/png", 1024L);

        when(projectMediaRepository.findAllById(List.of(asset.getId()))).thenReturn(List.of(asset));
        when(attachmentRepository.findByFeedbackId(thread.getId())).thenReturn(List.of());

        service().linkMediaAssets(List.of(asset.getId()), project, instructor, thread, null);

        verify(objectStorage).copy(org.mockito.ArgumentMatchers.eq(asset.getStorageKey()),
                org.mockito.ArgumentMatchers.argThat(dest -> dest.startsWith("feedback/" + project.getId() + "/")));
        ArgumentCaptor<FeedbackAttachment> saved = ArgumentCaptor.forClass(FeedbackAttachment.class);
        verify(attachmentRepository).save(saved.capture());
        FeedbackAttachment row = saved.getValue();
        assertThat(row.getFeedback()).isEqualTo(thread);
        assertThat(row.getMediaAsset()).isEqualTo(asset);
        assertThat(row.getStorageKey()).startsWith("feedback/" + project.getId() + "/");
        assertThat(row.getStorageKey()).isNotEqualTo(asset.getStorageKey());
        assertThat(row.getFileSizeBytes()).isEqualTo(1024L);
    }

    @Test
    void linkStatOncePersistsLegacySize() {
        User student = user(UserRole.STUDENT);
        Project project = project(student, ProjectStatus.RETURNED);
        InstructorFeedback thread = thread();
        ProjectMedia legacy = media(project, "image/jpeg", null);
        FeedbackReply reply = new FeedbackReply();
        reply.setId(UUID.randomUUID());

        when(projectMediaRepository.findAllById(List.of(legacy.getId()))).thenReturn(List.of(legacy));
        when(attachmentRepository.findByFeedbackId(thread.getId())).thenReturn(List.of());
        when(objectStorage.contentLength(legacy.getStorageKey())).thenReturn(2048L);

        service().linkMediaAssets(List.of(legacy.getId()), project, student, thread, reply);

        assertThat(legacy.getFileSizeBytes()).isEqualTo(2048L);
        verify(projectMediaRepository).save(legacy);
        ArgumentCaptor<FeedbackAttachment> saved = ArgumentCaptor.forClass(FeedbackAttachment.class);
        verify(attachmentRepository).save(saved.capture());
        assertThat(saved.getValue().getReply()).isEqualTo(reply);
        assertThat(saved.getValue().getFileSizeBytes()).isEqualTo(2048L);
    }

    @Test
    void linkMissingObjectConflicts() {
        User student = user(UserRole.STUDENT);
        Project project = project(student, ProjectStatus.RETURNED);
        InstructorFeedback thread = thread();
        ProjectMedia gone = media(project, "image/png", 100L);

        when(projectMediaRepository.findAllById(List.of(gone.getId()))).thenReturn(List.of(gone));
        when(attachmentRepository.findByFeedbackId(thread.getId())).thenReturn(List.of());
        org.mockito.Mockito.doThrow(new DocumentObjectStorage.DocumentStorageException("gone",
                new RuntimeException("404"))).when(objectStorage).copy(any(String.class), any(String.class));

        assertThatThrownBy(() -> service().linkMediaAssets(
                List.of(gone.getId()), project, student, thread, null))
                .isInstanceOfSatisfying(ResponseStatusException.class, e -> {
                    assertThat(e.getStatusCode().value()).isEqualTo(409);
                    assertThat(e.getReason()).contains("no longer in the library");
                });
        verify(attachmentRepository, never()).save(any());
    }

    private FeedbackAttachmentService service() {
        return new FeedbackAttachmentService(attachmentRepository, projectMediaRepository, objectStorage);
    }

    private User user(UserRole role) {
        User user = new User();
        user.setId(UUID.randomUUID());
        user.setEmail(user.getId() + "@example.test");
        user.setRole(role);
        user.setAccountStatus(AccountStatus.ACTIVE);
        return user;
    }

    private Project project(User member, ProjectStatus status) {
        Project project = new Project();
        project.setId(UUID.randomUUID());
        project.setTitle("Capstone");
        project.setActive(true);
        project.setStatus(status);
        ProjectMember membership = new ProjectMember();
        membership.setProject(project);
        membership.setUser(member);
        membership.setRole(member.getRole() == UserRole.INSTRUCTOR ? ProjectRole.INSTRUCTOR : ProjectRole.MEMBER);
        project.setProjectMembers(List.of(membership));
        return project;
    }

    private InstructorFeedback thread() {
        InstructorFeedback thread = new InstructorFeedback();
        thread.setId(UUID.randomUUID());
        return thread;
    }

    private ProjectMedia media(Project project, String mime, Long sizeBytes) {
        ProjectMedia asset = new ProjectMedia();
        asset.setId(UUID.randomUUID());
        asset.setProject(project);
        asset.setStorageKey("media/" + project.getId() + "/" + UUID.randomUUID() + ".png");
        asset.setTexFilename("diagram.png");
        asset.setMimeType(mime);
        asset.setFileSizeBytes(sizeBytes);
        asset.setUploadedAt(LocalDateTime.now());
        return asset;
    }
}
