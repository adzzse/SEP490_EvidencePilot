package com.evidencepilot.service.impl;

import com.evidencepilot.dto.request.CollectionRequest;
import com.evidencepilot.dto.response.CollectionResponse;
import com.evidencepilot.dto.response.PagedResponse;
import com.evidencepilot.exception.ResourceNotFoundException;
import com.evidencepilot.model.Collection;
import com.evidencepilot.model.CollectionCategory;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.CollectionCategoryRepository;
import com.evidencepilot.repository.CollectionRepository;
import com.evidencepilot.service.CollectionService;
import com.evidencepilot.service.CurrentUserService;
import com.evidencepilot.dto.request.PagingRequest;
import jakarta.persistence.criteria.Predicate;
import org.springframework.transaction.annotation.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class CollectionServiceImpl implements CollectionService {

    private static final Set<String> COLLECTION_SORT_FIELDS = Set.of("title", "createdAt");

    private final CollectionRepository collectionRepository;
    private final CollectionCategoryRepository collectionCategoryRepository;
    private final CurrentUserService currentUserService;
    private final ProjectCollectionService projectCollectionService;
    private final com.evidencepilot.repository.DocumentRepository documentRepository;
    private final com.evidencepilot.repository.CollectionDocumentRepository collectionDocumentRepository;

    @Override
    @Transactional
    public CollectionResponse createCollection(CollectionRequest request) {
        User currentUser = currentUserService.requireCurrentUser();
        currentUserService.requireRole(currentUser, UserRole.INSTRUCTOR);

        Collection collection = new Collection();
        collection.setTitle(request.name());
        collection.setDescription(request.description());
        collection.setCategory(resolveCategory(request.categoryId()));
        collection.setInstructor(currentUser);
        collection.setActive(true);
        collection.setCreatedAt(LocalDateTime.now());

        Collection saved = collectionRepository.save(collection);
        return toResponse(saved);
    }

    @Override
    public CollectionResponse getCollectionById(UUID id) {
        User currentUser = currentUserService.requireCurrentUser();
        Collection collection = collectionRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException(id, "Collection"));
        currentUserService.requireCollectionAccess(currentUser, collection);
        return toResponse(collection);
    }

    @Override
    @Transactional
    public CollectionResponse updateCollection(UUID id, CollectionRequest request) {
        User currentUser = currentUserService.requireCurrentUser();
        Collection collection = collectionRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException(id, "Collection"));
        currentUserService.requireCollectionAccess(currentUser, collection);
        collection.setTitle(request.name());
        collection.setDescription(request.description());
        collection.setCategory(resolveCategory(request.categoryId()));
        return toResponse(collectionRepository.save(collection));
    }

    @Override
    public PagedResponse<CollectionResponse> getMyCollections(int page, int size, String sort, String q, UUID categoryId) {
        User currentUser = currentUserService.requireCurrentUser();
        var pageable = PagingRequest.pageable(
                page, size, sort, COLLECTION_SORT_FIELDS, "createdAt,desc");
        var results = collectionRepository.findAll(
                myCollectionSpec(currentUser.getId(), q, categoryId), pageable);
        return PagedResponse.from(results.map(this::toResponse));
    }

    @Override
    @Transactional
    public void deleteCollection(UUID id) {
        User currentUser = currentUserService.requireCurrentUser();
        Collection collection = collectionRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException(id, "Collection"));
        currentUserService.requireCollectionAccess(currentUser, collection);
        projectCollectionService.prepareCollectionDeletion(collection);
        collection.setActive(false);
        collectionRepository.save(collection);
    }

    private CollectionResponse toResponse(Collection collection) {
        long direct = documentRepository.countByCollectionId(collection.getId());
        long shared = collectionDocumentRepository.findByCollectionId(collection.getId()).stream()
                .filter(cd -> cd.getDocument() != null && cd.getDocument().isActive() && cd.getDocument().getDocType() == DocumentType.SOURCE)
                .count();
        return CollectionResponse.from(collection, direct + shared);
    }

    private Specification<Collection> myCollectionSpec(UUID instructorId, String q, UUID categoryId) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.get("instructor").get("id"), instructorId));
            predicates.add(cb.equal(root.get("active"), true));

            if (q != null && !q.isBlank()) {
                String like = "%" + q.trim().toLowerCase(Locale.ROOT) + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("title")), like),
                        cb.like(cb.lower(root.get("description")), like)));
            }

            if (categoryId != null) {
                predicates.add(cb.equal(root.get("category").get("id"), categoryId));
            }

            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }

    private CollectionCategory resolveCategory(UUID categoryId) {
        if (categoryId == null) return null;
        return collectionCategoryRepository.findByIdAndActiveTrue(categoryId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Collection category not found"));
    }
}
