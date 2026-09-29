package com.evidencepilot.controller;

import com.evidencepilot.service.impl.TraceabilityExportServiceImpl;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
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
    void exportCsvStreamsArchiveAndDeletesTemporaryFile() throws Exception {
        TraceabilityExportServiceImpl service = mock(TraceabilityExportServiceImpl.class);
        MockMvc mockMvc = standaloneSetup(new TraceabilityExportController(service)).build();
        UUID projectId = UUID.randomUUID();
        byte[] csv = new byte[] { 'P', 'K', 3, 4 };
        Path archive = Files.write(Files.createTempFile("project-data-csv-test-", ".zip"), csv);
        when(service.exportTraceabilityCsv(projectId)).thenReturn(archive);

        MvcResult result = mockMvc.perform(get("/api/projects/{projectId}/traceability/csv", projectId))
                .andExpect(request().asyncStarted())
                .andReturn();
        mockMvc.perform(asyncDispatch(result))
                .andExpect(status().isOk())
                .andExpect(header().string(
                        HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"project-data-csv.zip\""))
                .andExpect(content().contentTypeCompatibleWith(MediaType.parseMediaType("application/zip")))
                .andExpect(content().bytes(csv));

        org.assertj.core.api.Assertions.assertThat(archive).doesNotExist();
        verify(service).exportTraceabilityCsv(projectId);
    }
}
