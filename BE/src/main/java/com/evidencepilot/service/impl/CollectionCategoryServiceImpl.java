package com.evidencepilot.service.impl;

import com.evidencepilot.dto.request.CollectionCategoryRequest;
import com.evidencepilot.dto.response.CollectionCategoryResponse;
import com.evidencepilot.exception.ResourceNotFoundException;
import com.evidencepilot.model.CollectionCategory;
import com.evidencepilot.repository.CollectionCategoryRepository;
import com.evidencepilot.service.AuditService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class CollectionCategoryServiceImpl {

    private final CollectionCategoryRepository collectionCategoryRepository;
    private final CurrentUserServiceImpl currentUserService;
    private final AuditService auditService;

    public List<CollectionCategoryResponse> getActiveCategories() {
        return collectionCategoryRepository.findByActiveTrueOrderByNameAsc().stream()
                .map(CollectionCategoryResponse::from)
                .toList();
    }

    public List<CollectionCategoryResponse> getCategories(Boolean active) {
        var categories = active == null
                ? collectionCategoryRepository.findAll()
                : collectionCategoryRepository.findByActiveOrderByNameAsc(active);
        return categories.stream()
                .map(CollectionCategoryResponse::from)
                .toList();
    }

    @Transactional
    public CollectionCategoryResponse create(CollectionCategoryRequest request) {
        String name = request.name().trim();
        if (collectionCategoryRepository.existsByNameIgnoreCase(name)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Collection category already exists");
        }

        CollectionCategory category = new CollectionCategory();
        category.setName(name);
        category.setDescription(request.description());
        category.setActive(true);
        category.setCreatedAt(LocalDateTime.now());
        category = collectionCategoryRepository.save(category);
        auditService.record("COLLECTION_CATEGORY_CREATED", "COLLECTION_CATEGORY", category.getId(),
                currentUserService.requireCurrentUser(), null, safeValue(category));
        return CollectionCategoryResponse.from(category);
    }

    @Transactional
    public CollectionCategoryResponse update(UUID id, CollectionCategoryRequest request, Boolean active) {
        CollectionCategory category = collectionCategoryRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException(id, "Collection category"));
        String name = request.name().trim();
        if (collectionCategoryRepository.existsByNameIgnoreCaseAndIdNot(name, id)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Collection category already exists");
        }

        Map<String, Object> oldValue = safeValue(category);
        category.setName(name);
        category.setDescription(request.description());
        if (active != null) {
            category.setActive(active);
        }
        category = collectionCategoryRepository.save(category);
        auditService.record("COLLECTION_CATEGORY_UPDATED", "COLLECTION_CATEGORY", category.getId(),
                currentUserService.requireCurrentUser(), oldValue, safeValue(category));
        return CollectionCategoryResponse.from(category);
    }

    @Transactional
    public void delete(UUID id) {
        CollectionCategory category = collectionCategoryRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException(id, "Collection category"));
        Map<String, Object> oldValue = safeValue(category);
        category.setActive(false);
        collectionCategoryRepository.save(category);
        auditService.record("COLLECTION_CATEGORY_DELETED", "COLLECTION_CATEGORY", category.getId(),
                currentUserService.requireCurrentUser(), oldValue, safeValue(category));
    }

    private Map<String, Object> safeValue(CollectionCategory category) {
        Map<String, Object> value = new LinkedHashMap<>();
        value.put("name", category.getName());
        value.put("description", category.getDescription());
        value.put("active", category.isActive());
        return value;
    }
}
