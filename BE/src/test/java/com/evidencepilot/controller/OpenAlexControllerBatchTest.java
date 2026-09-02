package com.evidencepilot.controller;

import com.evidencepilot.dto.request.DoiBatchIngestionRequest;
import com.evidencepilot.service.OpenAlexIngestionService;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

class OpenAlexControllerBatchTest {

    private final OpenAlexIngestionService ingestionService = mock(OpenAlexIngestionService.class);
    private final OpenAlexController controller = new OpenAlexController(ingestionService);

    @Test
    void batchNormalizesDeduplicatesAndReportsInvalidDoi() {
        UUID projectId = UUID.randomUUID();

        var response = controller.ingestBatch(new DoiBatchIngestionRequest(
                List.of("https://doi.org/10.1000/ABC", "10.1000/abc", "not-a-doi"),
                projectId,
                null));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.MULTI_STATUS);
        assertThat(response.getBody().succeeded()).hasSize(1);
        assertThat(response.getBody().failed()).singleElement().satisfies(failure -> {
            assertThat(failure.doi()).isEqualTo("not-a-doi");
            assertThat(failure.code()).isEqualTo("FORMAT");
        });
        verify(ingestionService).ingestByDoi(projectId, null, "10.1000/ABC");
        verifyNoMoreInteractions(ingestionService);
    }

    @Test
    void allAcceptedDoiReturnAcceptedStatus() {
        UUID projectId = UUID.randomUUID();

        var response = controller.ingestBatch(new DoiBatchIngestionRequest(
                List.of("10.1000/abc"), projectId, null));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.ACCEPTED);
        assertThat(response.getBody().failed()).isEmpty();
    }

    @Test
    void batchDoesNotConvertAuthorizationFailuresIntoItemFailures() {
        UUID projectId = UUID.randomUUID();
        when(ingestionService.ingestByDoi(projectId, null, "10.1000/abc"))
                .thenThrow(new ResponseStatusException(HttpStatus.FORBIDDEN, "denied"));

        assertThatThrownBy(() -> controller.ingestBatch(new DoiBatchIngestionRequest(
                List.of("10.1000/abc"), projectId, null)))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(((ResponseStatusException) error).getStatusCode())
                        .isEqualTo(HttpStatus.FORBIDDEN));
    }
}
