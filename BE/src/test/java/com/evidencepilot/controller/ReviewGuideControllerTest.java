package com.evidencepilot.controller;

import com.evidencepilot.dto.response.ReviewGuideResponse;
import com.evidencepilot.service.impl.ReviewGuideServiceImpl;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

class ReviewGuideControllerTest {

    @Test
    void getActiveGuides_returnsHydratedGuide() throws Exception {
        ReviewGuideServiceImpl service = mock(ReviewGuideServiceImpl.class);
        when(service.getActiveGuides()).thenReturn(List.of(
                new ReviewGuideResponse("Methods", "A strong methods section is reproducible.",
                        List.of("Is the study design stated?", "Are procedures reproducible?"))));
        MockMvc mockMvc = standaloneSetup(new ReviewGuideController(service)).build();

        mockMvc.perform(get("/api/review-guides"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].sectionType").value("Methods"))
                .andExpect(jsonPath("$[0].guidance").value("A strong methods section is reproducible."))
                .andExpect(jsonPath("$[0].checklist[0]").value("Is the study design stated?"))
                .andExpect(jsonPath("$[0].checklist[1]").value("Are procedures reproducible?"));

        verify(service).getActiveGuides();
    }

    @Test
    void getActiveGuides_returnsEmptyListWhenNone() throws Exception {
        ReviewGuideServiceImpl service = mock(ReviewGuideServiceImpl.class);
        when(service.getActiveGuides()).thenReturn(List.of());
        MockMvc mockMvc = standaloneSetup(new ReviewGuideController(service)).build();

        mockMvc.perform(get("/api/review-guides"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }
}
