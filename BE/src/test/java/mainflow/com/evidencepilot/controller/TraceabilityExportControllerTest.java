package com.evidencepilot.controller;

import com.evidencepilot.service.impl.TraceabilityExportServiceImpl;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

class TraceabilityExportControllerTest {

    @Test
    void export_delegatesProjectId() throws Exception {
        TraceabilityExportServiceImpl service = mock(TraceabilityExportServiceImpl.class);
        MockMvc mockMvc = standaloneSetup(new TraceabilityExportController(service)).build();
        UUID projectId = UUID.randomUUID();

        mockMvc.perform(get("/api/projects/{projectId}/traceability", projectId))
                .andExpect(status().isOk());

        verify(service).exportTraceability(projectId);
    }

    @Test
    void exportCsvReturnsDownloadHeadersAndServiceBytes() throws Exception {
        TraceabilityExportServiceImpl service = mock(TraceabilityExportServiceImpl.class);
        MockMvc mockMvc = standaloneSetup(new TraceabilityExportController(service)).build();
        UUID projectId = UUID.randomUUID();
        byte[] csv = "\uFEFFheader\nvalue\n".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        when(service.exportTraceabilityCsv(projectId)).thenReturn(csv);

        mockMvc.perform(get("/api/projects/{projectId}/traceability/csv", projectId))
                .andExpect(status().isOk())
                .andExpect(header().string(
                        HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"traceability.csv\""))
                .andExpect(content().contentTypeCompatibleWith(MediaType.parseMediaType("text/csv;charset=utf-8")))
                .andExpect(content().bytes(csv));

        verify(service).exportTraceabilityCsv(projectId);
    }
}
