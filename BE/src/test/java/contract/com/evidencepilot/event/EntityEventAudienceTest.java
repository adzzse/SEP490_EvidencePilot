package com.evidencepilot.event;

import com.evidencepilot.model.Collection;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.ProjectCollection;
import com.evidencepilot.model.ProjectMember;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.CollectionRepository;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.ProjectCollectionRepository;
import com.evidencepilot.repository.ProjectMemberRepository;
import com.evidencepilot.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class EntityEventAudienceTest {

    @Mock private UserRepository users;
    @Mock private ProjectMemberRepository members;
    @Mock private DocumentRepository documents;
    @Mock private CollectionRepository collections;
    @Mock private ProjectCollectionRepository projectCollections;

    @InjectMocks private EntityEventAudience audience;

    @Test
    void nullEvent_returnsEmpty() {
        assertThat(audience.recipients(null)).isEmpty();
        assertThat(audience.recipients(new EntityChangedEvent(null, UUID.randomUUID(), "X", null))).isEmpty();
    }

    @Test
    void userEvent_targetsUserAndAdmins() {
        UUID userId = UUID.randomUUID();
        User admin = user(UUID.randomUUID());
        when(users.findByRole(UserRole.ADMIN)).thenReturn(List.of(admin));

        assertThat(audience.recipients(new EntityChangedEvent("USER", userId, "STATUS_CHANGED", null)))
                .containsExactlyInAnyOrder(userId, admin.getId());
    }

    @Test
    void projectEvent_targetsMembersAndAdmins() {
        UUID projectId = UUID.randomUUID();
        User admin = user(UUID.randomUUID());
        User member = user(UUID.randomUUID());
        when(users.findByRole(UserRole.ADMIN)).thenReturn(List.of(admin));
        when(members.findByProjectId(projectId)).thenReturn(List.of(member(member)));

        assertThat(audience.recipients(new EntityChangedEvent("PROJECT", projectId, "STATUS_CHANGED", null)))
                .containsExactlyInAnyOrder(member.getId(), admin.getId());
    }

    @Test
    void categoryEvent_targetsInstructorsAndAdmins() {
        User admin = user(UUID.randomUUID());
        User instructor = user(UUID.randomUUID());
        when(users.findByRole(UserRole.ADMIN)).thenReturn(List.of(admin));
        when(users.findByRole(UserRole.INSTRUCTOR)).thenReturn(List.of(instructor));

        assertThat(audience.recipients(new EntityChangedEvent("CATEGORY", UUID.randomUUID(), "CREATED", null)))
                .containsExactlyInAnyOrder(admin.getId(), instructor.getId());
    }

    @Test
    void documentWithProject_targetsMembersWithoutLoading() {
        UUID projectId = UUID.randomUUID();
        User admin = user(UUID.randomUUID());
        User member = user(UUID.randomUUID());
        when(users.findByRole(UserRole.ADMIN)).thenReturn(List.of(admin));
        when(members.findByProjectId(projectId)).thenReturn(List.of(member(member)));

        assertThat(audience.recipients(
                new EntityChangedEvent("DOCUMENT", UUID.randomUUID(), "READY", projectId)))
                .containsExactlyInAnyOrder(member.getId(), admin.getId());
    }

    @Test
    void documentWithoutProject_resolvesOwnerProjectAndUploader() {
        UUID docId = UUID.randomUUID();
        User admin = user(UUID.randomUUID());
        User uploader = user(UUID.randomUUID());
        User member = user(UUID.randomUUID());
        Project project = new Project();
        project.setId(UUID.randomUUID());
        Document document = new Document();
        document.setId(docId);
        document.setProject(project);
        document.setUploadedBy(uploader);
        when(users.findByRole(UserRole.ADMIN)).thenReturn(List.of(admin));
        when(documents.findById(docId)).thenReturn(Optional.of(document));
        when(members.findByProjectId(project.getId())).thenReturn(List.of(member(member)));

        assertThat(audience.recipients(new EntityChangedEvent("DOCUMENT", docId, "READY", null)))
                .containsExactlyInAnyOrder(admin.getId(), uploader.getId(), member.getId());
    }

    @Test
    void collectionWithoutProject_resolvesInstructorAndLinkedMembers() {
        UUID collectionId = UUID.randomUUID();
        User admin = user(UUID.randomUUID());
        User instructor = user(UUID.randomUUID());
        User member = user(UUID.randomUUID());
        Project project = new Project();
        project.setId(UUID.randomUUID());
        Collection collection = new Collection();
        collection.setId(collectionId);
        collection.setInstructor(instructor);
        ProjectCollection link = new ProjectCollection();
        link.setProject(project);
        when(users.findByRole(UserRole.ADMIN)).thenReturn(List.of(admin));
        when(collections.findById(collectionId)).thenReturn(Optional.of(collection));
        when(projectCollections.findByCollectionId(collectionId)).thenReturn(List.of(link));
        when(members.findByProjectId(project.getId())).thenReturn(List.of(member(member)));

        assertThat(audience.recipients(new EntityChangedEvent("COLLECTION", collectionId, "UPDATED", null)))
                .containsExactlyInAnyOrder(admin.getId(), instructor.getId(), member.getId());
    }

    @Test
    void feedbackWithoutProject_targetsAdminsOnly() {
        User admin = user(UUID.randomUUID());
        when(users.findByRole(UserRole.ADMIN)).thenReturn(List.of(admin));

        assertThat(audience.recipients(new EntityChangedEvent("FEEDBACK", UUID.randomUUID(), "X", null)))
                .containsExactly(admin.getId());
    }

    @Test
    void unknownEntity_targetsAdminsOnly() {
        User admin = user(UUID.randomUUID());
        when(users.findByRole(UserRole.ADMIN)).thenReturn(List.of(admin));

        assertThat(audience.recipients(new EntityChangedEvent("NOPE", UUID.randomUUID(), "X", null)))
                .containsExactly(admin.getId());
    }

    private static User user(UUID id) {
        User user = new User();
        user.setId(id);
        return user;
    }

    private static ProjectMember member(User user) {
        ProjectMember member = new ProjectMember();
        member.setUser(user);
        return member;
    }
}
