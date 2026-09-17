package com.evidencepilot.controller;

import com.evidencepilot.service.HealthService;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Map;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

class HealthControllerTest {

    @Test
    void health_returnsBackendAndAiStatus() throws Exception {
        HealthService healthService = mock(HealthService.class);
        when(healthService.checkReadiness()).thenReturn(Map.of("status", "UP", "ai", Map.of("status", "UP")));
        MockMvc mockMvc = standaloneSetup(new HealthController(healthService)).build();

        mockMvc.perform(get("/api/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"))
                .andExpect(jsonPath("$.ai.status").value("UP"));

        verify(healthService).checkReadiness();
    }

    @Test
    void healthStaysUpWhenAiIsOffline() throws Exception {
        HealthService healthService = mock(HealthService.class);
        when(healthService.checkReadiness()).thenReturn(Map.of("status", "UP", "ai", Map.of("status", "unavailable")));
        MockMvc mockMvc = standaloneSetup(new HealthController(healthService)).build();

        mockMvc.perform(get("/api/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"))
                .andExpect(jsonPath("$.ai.status").value("unavailable"));
    }
}
