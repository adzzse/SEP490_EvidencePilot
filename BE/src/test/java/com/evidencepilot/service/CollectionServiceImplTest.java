package com.evidencepilot.service;

import com.evidencepilot.dto.request.CollectionRequest;
import com.evidencepilot.model.Collection;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.CollectionCategoryRepository;
import com.evidencepilot.repository.CollectionRepository;
import com.evidencepilot.service.impl.CollectionServiceImpl;
import com.evidencepilot.service.impl.ProjectCollectionService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CollectionServiceImplTest {

    @Mock
    private CollectionRepository collectionRepository;

    @Mock
    private CollectionCategoryRepository collectionCategoryRepository;

    @Mock
    private CurrentUserService currentUserService;

    @Mock
    private ProjectCollectionService projectCollectionService;

    @Mock
    private com.evidencepilot.repository.DocumentRepository documentRepository;

    @Mock
    private com.evidencepilot.repository.CollectionDocumentRepository collectionDocumentRepository;

    @Test
    void createCollectionRequiresInstructorRole() {
        User instructor = user(UserRole.INSTRUCTOR);
        CollectionRequest request = new CollectionRequest("Evidence", "Notes", null);

        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(collectionRepository.save(any(Collection.class))).thenAnswer(invocation -> {
            Collection collection = invocation.getArgument(0);
            collection.setId(UUID.randomUUID());
            return collection;
        });

        var response = service().createCollection(request);

        assertThat(response.name()).isEqualTo("Evidence");
        verify(currentUserService).requireRole(instructor, UserRole.INSTRUCTOR);
    }

    @Test
    void getCollectionByIdChecksCollectionAccess() {
        User instructor = user(UserRole.INSTRUCTOR);
        Collection collection = collection(instructor);

        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(collectionRepository.findById(collection.getId())).thenReturn(Optional.of(collection));

        service().getCollectionById(collection.getId());

        verify(currentUserService).requireCollectionAccess(instructor, collection);
    }

    @Test
    void deleteCollectionChecksCollectionAccess() {
        User instructor = user(UserRole.INSTRUCTOR);
        Collection collection = collection(instructor);

        when(currentUserService.requireCurrentUser()).thenReturn(instructor);
        when(collectionRepository.findById(collection.getId())).thenReturn(Optional.of(collection));

        service().deleteCollection(collection.getId());

        verify(currentUserService).requireCollectionAccess(instructor, collection);
        verify(projectCollectionService).prepareCollectionDeletion(collection);
    }

    private CollectionServiceImpl service() {
        return new CollectionServiceImpl(
                collectionRepository, collectionCategoryRepository, currentUserService, projectCollectionService,
                documentRepository, collectionDocumentRepository);
    }

    private User user(UserRole role) {
        User user = new User();
        user.setId(UUID.randomUUID());
        user.setRole(role);
        user.setEmail(user.getId() + "@example.com");
        return user;
    }

    private Collection collection(User instructor) {
        Collection collection = new Collection();
        collection.setId(UUID.randomUUID());
        collection.setTitle("Evidence");
        collection.setInstructor(instructor);
        collection.setActive(true);
        return collection;
    }
}
