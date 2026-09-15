package com.evidencepilot.controller;

import com.evidencepilot.dto.request.CollectionCategoryRequest;
import com.evidencepilot.dto.response.CollectionCategoryResponse;
import com.evidencepilot.service.impl.CollectionCategoryServiceImpl;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
@Tag(name = "Collection Categories", description = "Collection category configuration")
public class CollectionCategoryController {

    private final CollectionCategoryServiceImpl collectionCategoryService;

    @GetMapping("/api/collection-categories")
    public List<CollectionCategoryResponse> activeCategories() {
        return collectionCategoryService.getActiveCategories();
    }

    @GetMapping("/api/admin/collection-categories")
    @PreAuthorize("hasRole('ADMIN')")
    public List<CollectionCategoryResponse> adminCategories(@RequestParam(required = false) Boolean active) {
        return collectionCategoryService.getCategories(active);
    }

    @PostMapping("/api/admin/collection-categories")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasRole('ADMIN')")
    public CollectionCategoryResponse create(@Valid @RequestBody CollectionCategoryRequest request) {
        return collectionCategoryService.create(request);
    }

    @PutMapping("/api/admin/collection-categories/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public CollectionCategoryResponse update(
            @PathVariable UUID id,
            @Valid @RequestBody CollectionCategoryRequest request,
            @RequestParam(required = false) Boolean active) {
        return collectionCategoryService.update(id, request, active);
    }

    @DeleteMapping("/api/admin/collection-categories/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasRole('ADMIN')")
    public void delete(@PathVariable UUID id) {
        collectionCategoryService.delete(id);
    }
}
