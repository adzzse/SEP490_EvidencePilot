package com.evidencepilot.service.impl;

import com.evidencepilot.dto.request.CollectionCategoryRequest;
import com.evidencepilot.event.EntityChangedEvent;
import com.evidencepilot.exception.ResourceNotFoundException;
import com.evidencepilot.model.CollectionCategory;
import com.evidencepilot.repository.CollectionCategoryRepository;
import com.evidencepilot.repository.CollectionRepository;
import com.evidencepilot.service.AuditService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CollectionCategoryServiceImplTest {

    @Mock private CollectionCategoryRepository repository;
    @Mock private CollectionRepository collectionRepository;
    @Mock private CurrentUserServiceImpl currentUserService;
    @Mock private AuditService auditService;
    @Mock private ApplicationEventPublisher events;

    @Test
    void createPublishesCategoryCreatedEvent() {
        when(repository.existsByNameIgnoreCase("New")).thenReturn(false);
        when(repository.save(any())).thenAnswer(invocation -> {
            CollectionCategory saved = invocation.getArgument(0);
            saved.setId(UUID.randomUUID());
            return saved;
        });

        service().create(new CollectionCategoryRequest("New", null));

        verify(events).publishEvent(argThat((Object e) -> e instanceof EntityChangedEvent evt
                && "CATEGORY".equals(evt.entity()) && "CREATED".equals(evt.action())));
    }

    @Test
    void createRejectsDuplicateNameWithoutSideEffects() {
        when(repository.existsByNameIgnoreCase("Existing")).thenReturn(true);

        assertConflict(() -> service().create(new CollectionCategoryRequest(" Existing ", null)));

        verify(repository, never()).save(any());
        verifyNoInteractions(currentUserService, auditService);
    }

    @Test
    void updateRejectsMissingCategoryWithoutSideEffects() {
        UUID id = UUID.randomUUID();
        when(repository.findById(id)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service().update(
                id, new CollectionCategoryRequest("Updated", null), true))
                .isInstanceOf(ResourceNotFoundException.class);

        verify(repository, never()).save(any());
        verifyNoInteractions(currentUserService, auditService);
    }

    @Test
    void updateRejectsDuplicateNameBeforeMutatingCategory() {
        UUID id = UUID.randomUUID();
        CollectionCategory category = category(id, "Original");
        when(repository.findById(id)).thenReturn(Optional.of(category));
        when(repository.existsByNameIgnoreCaseAndIdNot("Existing", id)).thenReturn(true);

        assertConflict(() -> service().update(
                id, new CollectionCategoryRequest(" Existing ", null), false));

        assertThat(category.getName()).isEqualTo("Original");
        assertThat(category.isActive()).isTrue();
        verify(repository, never()).save(any());
        verifyNoInteractions(currentUserService, auditService);
    }

    @Test
    void deleteRejectsMissingCategoryWithoutSideEffects() {
        UUID id = UUID.randomUUID();
        when(repository.findById(id)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service().delete(id))
                .isInstanceOf(ResourceNotFoundException.class);

        verify(repository, never()).save(any());
        verifyNoInteractions(currentUserService, auditService);
    }

    private CollectionCategoryServiceImpl service() {
        return new CollectionCategoryServiceImpl(repository, collectionRepository, currentUserService, auditService, events);
    }

    private static CollectionCategory category(UUID id, String name) {
        CollectionCategory category = new CollectionCategory();
        category.setId(id);
        category.setName(name);
        category.setActive(true);
        return category;
    }

    private static void assertConflict(Runnable action) {
        assertThatThrownBy(action::run)
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        exception -> assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.CONFLICT));
    }
}
