package com.evidencepilot.controller;

import com.evidencepilot.dto.request.CollectionCategoryRequest;
import com.evidencepilot.service.CollectionCategoryService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.server.ResponseStatusException;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

class CollectionCategoryControllerTest {

    private final CollectionCategoryService service = mock(CollectionCategoryService.class);
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = standaloneSetup(new CollectionCategoryController(service))
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void createRejectsBlankNameBeforeCallingService() throws Exception {
        mockMvc.perform(post("/api/admin/collection-categories")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\" \",\"description\":\"Invalid\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.name").exists());

        verifyNoInteractions(service);
    }

    @Test
    void createPreservesDuplicateConflict() throws Exception {
        doThrow(new ResponseStatusException(HttpStatus.CONFLICT, "Collection category already exists"))
                .when(service).create(any(CollectionCategoryRequest.class));

        mockMvc.perform(post("/api/admin/collection-categories")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Existing\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Collection category already exists"));
    }
}
