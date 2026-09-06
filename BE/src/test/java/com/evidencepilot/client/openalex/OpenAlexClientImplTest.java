package com.evidencepilot.client.openalex;

import com.evidencepilot.dto.openalex.OpenAlexWorkResponse;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.RestClient;

import java.io.ByteArrayInputStream;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OpenAlexClientImplTest {

    @Mock
    private RestClient restClient;

    @Mock
    private RestClient.RequestHeadersUriSpec requestHeadersUriSpec;

    @Mock
    private RestClient.RequestHeadersSpec requestHeadersSpec;

    @Mock
    private RestClient.ResponseSpec responseSpec;

    private final OpenAlexWorkResponse sampleWork = new OpenAlexWorkResponse(
            "https://openalex.org/W123",
            "https://doi.org/10.1000/xyz123",
            "Test Paper Title",
            List.of(
                    new OpenAlexWorkResponse.OpenAlexAuthor(
                            new OpenAlexWorkResponse.Author("Alice Smith")),
                    new OpenAlexWorkResponse.OpenAlexAuthor(
                            new OpenAlexWorkResponse.Author("Bob Jones"))
            ),
            new OpenAlexWorkResponse.OpenAlexPrimaryLocation(
                    new OpenAlexWorkResponse.OpenAlexSource(
                            "Test Publisher", "Test Organization", "journal",
                            "https://example.com"),
                    "https://example.com/paper.pdf",
                    "https://example.com/paper",
                    "cc-by",
                    "acceptedVersion",
                    true
            ),
            null,
            new OpenAlexWorkResponse.OpenAlexOpenAccess(true, "green", "https://example.com/paper.pdf", true),
            null,
            2024,
            null,
            List.of(),
            null
    );

    private static final String BASE = "https://api.openalex.org";

    @Test
    void fetchWork_returnsDeserializedResponse() {
        when(restClient.get()).thenReturn(requestHeadersUriSpec);
        when(requestHeadersUriSpec.uri(BASE + "/works/doi:10.1000/xyz123")).thenReturn(requestHeadersSpec);
        when(requestHeadersSpec.retrieve()).thenReturn(responseSpec);
        when(responseSpec.body(OpenAlexWorkResponse.class)).thenReturn(sampleWork);

        OpenAlexClientImpl client = new OpenAlexClientImpl(restClient, BASE, "", mock(HttpClient.class), new ObjectMapper());
        OpenAlexWorkResponse result = client.fetchWork("10.1000/xyz123");

        assertThat(result.title()).isEqualTo("Test Paper Title");
        assertThat(result.publicationYear()).isEqualTo(2024);
        assertThat(result.oaUrl()).isEqualTo("https://example.com/paper.pdf");
        assertThat(result.authorNames()).containsExactly("Alice Smith", "Bob Jones");
    }

    @Test
    void fetchWork_throwsOnNullResponse() {
        when(restClient.get()).thenReturn(requestHeadersUriSpec);
        when(requestHeadersUriSpec.uri(BASE + "/works/doi:10.1000/bad-doi")).thenReturn(requestHeadersSpec);
        when(requestHeadersSpec.retrieve()).thenReturn(responseSpec);
        when(responseSpec.body(OpenAlexWorkResponse.class)).thenReturn(null);

        OpenAlexClientImpl client = new OpenAlexClientImpl(restClient, BASE, "", mock(HttpClient.class), new ObjectMapper());

        assertThatThrownBy(() -> client.fetchWork("10.1000/bad-doi"))
                .isInstanceOf(OpenAlexClient.OpenAlexApiException.class)
                .hasMessageContaining("null");
    }

    @Test
    void fetchWork_prependsDoiPrefixWhenMissing() {
        when(restClient.get()).thenReturn(requestHeadersUriSpec);
        when(requestHeadersUriSpec.uri(BASE + "/works/doi:10.1000/xyz")).thenReturn(requestHeadersSpec);
        when(requestHeadersSpec.retrieve()).thenReturn(responseSpec);
        when(responseSpec.body(OpenAlexWorkResponse.class)).thenReturn(sampleWork);

        OpenAlexClientImpl client = new OpenAlexClientImpl(restClient, BASE, "", mock(HttpClient.class), new ObjectMapper());
        OpenAlexWorkResponse result = client.fetchWork("10.1000/xyz");

        assertThat(result).isNotNull();
    }

    @Test
    void fetchWork_handlesDoiWithPrefix() {
        when(restClient.get()).thenReturn(requestHeadersUriSpec);
        when(requestHeadersUriSpec.uri(BASE + "/works/doi:10.1000/xyz")).thenReturn(requestHeadersSpec);
        when(requestHeadersSpec.retrieve()).thenReturn(responseSpec);
        when(responseSpec.body(OpenAlexWorkResponse.class)).thenReturn(sampleWork);

        OpenAlexClientImpl client = new OpenAlexClientImpl(restClient, BASE, "", mock(HttpClient.class), new ObjectMapper());
        OpenAlexWorkResponse result = client.fetchWork("doi:10.1000/xyz");

        assertThat(result).isNotNull();
    }

    @Test
    void fetchWork_rejectsMalformedDoiWithBadRequestStatus() {
        OpenAlexClientImpl client = new OpenAlexClientImpl(restClient, BASE, "", mock(HttpClient.class), new ObjectMapper());

        assertThatThrownBy(() -> client.fetchWork("not-a-doi"))
                .isInstanceOf(OpenAlexClient.OpenAlexApiException.class)
                .hasMessageContaining("Invalid DOI")
                .satisfies(e -> assertThat(((OpenAlexClient.OpenAlexApiException) e).getStatusCode()).isEqualTo(400));
    }

    @Test
    void fetchWork_mapsUpstreamNotFoundTo404() {
        when(restClient.get()).thenReturn(requestHeadersUriSpec);
        when(requestHeadersUriSpec.uri(BASE + "/works/doi:10.0000/e2e-invalid-doi")).thenReturn(requestHeadersSpec);
        when(requestHeadersSpec.retrieve()).thenReturn(responseSpec);
        when(responseSpec.body(OpenAlexWorkResponse.class))
                .thenThrow(HttpClientErrorException.create(HttpStatus.NOT_FOUND, "Not Found",
                        HttpHeaders.EMPTY, new byte[0], null));

        OpenAlexClientImpl client = new OpenAlexClientImpl(restClient, BASE, "", mock(HttpClient.class), new ObjectMapper());

        assertThatThrownBy(() -> client.fetchWork("10.0000/e2e-invalid-doi"))
                .isInstanceOf(OpenAlexClient.OpenAlexApiException.class)
                .satisfies(e -> assertThat(((OpenAlexClient.OpenAlexApiException) e).getStatusCode()).isEqualTo(404));
    }

    @Test
    void fetchWork_mapsUpstreamServerOrRateLimitErrorTo502() {
        when(restClient.get()).thenReturn(requestHeadersUriSpec);
        when(requestHeadersUriSpec.uri(BASE + "/works/doi:10.1000/xyz")).thenReturn(requestHeadersSpec);
        when(requestHeadersSpec.retrieve()).thenReturn(responseSpec);
        when(responseSpec.body(OpenAlexWorkResponse.class))
                .thenThrow(HttpServerErrorException.create(HttpStatus.BAD_GATEWAY, "Bad Gateway",
                        HttpHeaders.EMPTY, new byte[0], null));

        OpenAlexClientImpl client = new OpenAlexClientImpl(restClient, BASE, "", mock(HttpClient.class), new ObjectMapper());

        assertThatThrownBy(() -> client.fetchWork("10.1000/xyz"))
                .isInstanceOf(OpenAlexClient.OpenAlexApiException.class)
                .satisfies(e -> assertThat(((OpenAlexClient.OpenAlexApiException) e).getStatusCode()).isEqualTo(502));
    }

    @Test
    void workLists_distinguishEmptyResultsFromProviderFailure() {
        when(restClient.get()).thenReturn(requestHeadersUriSpec);
        when(requestHeadersUriSpec.uri(org.mockito.ArgumentMatchers.anyString())).thenReturn(requestHeadersSpec);
        when(requestHeadersSpec.retrieve()).thenReturn(responseSpec);
        when(responseSpec.body(String.class)).thenReturn("{\"results\":[]}", "{\"error\":\"quota\"}")
                .thenThrow(new IllegalStateException("private provider details"));
        OpenAlexClientImpl client = new OpenAlexClientImpl(restClient, BASE, "", mock(HttpClient.class), new ObjectMapper());
        assertThat(client.fetchCitedByWorks("W1", 5)).isEmpty();
        assertThatThrownBy(() -> client.fetchCitedByWorks("W1", 5))
                .isInstanceOf(OpenAlexClient.OpenAlexApiException.class);
        assertThatThrownBy(() -> client.fetchWorksByIds(java.util.List.of("W1"), "id,doi"))
                .isInstanceOf(OpenAlexClient.OpenAlexApiException.class)
                .hasMessage("OpenAlex work list could not be loaded");
    }

    @Test
    void largeReferenceListsAreFetchedInBatchesWithoutDroppingIds() {
        when(restClient.get()).thenReturn(requestHeadersUriSpec);
        when(requestHeadersUriSpec.uri(org.mockito.ArgumentMatchers.anyString())).thenReturn(requestHeadersSpec);
        when(requestHeadersSpec.retrieve()).thenReturn(responseSpec);
        when(responseSpec.body(String.class)).thenReturn("{\"results\":[{\"id\":\"W0\"}]}", "{\"results\":[{\"id\":\"W100\"}]}");
        var ids = java.util.stream.IntStream.range(0, 129).mapToObj(i -> "https://openalex.org/W" + i).toList();
        var client = new OpenAlexClientImpl(restClient, BASE, "", mock(HttpClient.class), new ObjectMapper());
        assertThat(client.fetchWorksByIds(ids, "id,doi")).extracting(OpenAlexWorkResponse::id).containsExactly("W0", "W100");
        var requests = ArgumentCaptor.forClass(String.class);
        org.mockito.Mockito.verify(requestHeadersUriSpec, org.mockito.Mockito.times(2)).uri(requests.capture());
        assertThat(requests.getAllValues().getFirst()).contains("W0|W1|").contains("|W99&").doesNotContain("|W100");
        assertThat(requests.getAllValues().getLast()).contains("openalex:W100|").contains("|W128&");
    }

    @Test
    void downloadPdf_returnsInputStream() throws Exception {
        byte[] pdfBytes = "fake-pdf-content".getBytes();

        HttpResponse<ByteArrayInputStream> httpResponse = mock();
        when(httpResponse.statusCode()).thenReturn(200);
        when(httpResponse.body()).thenReturn(new ByteArrayInputStream(pdfBytes));

        HttpClient httpClient = mock();
        ArgumentCaptor<HttpRequest> requestCaptor = ArgumentCaptor.forClass(HttpRequest.class);
        when(httpClient.send(requestCaptor.capture(), any(HttpResponse.BodyHandler.class)))
                .thenReturn(httpResponse);

        OpenAlexClientImpl client = new OpenAlexClientImpl(restClient, BASE, "", httpClient, new ObjectMapper());
        try (var result = client.downloadPdf("https://example.com/file.pdf")) {
            assertThat(result).isNotNull();
            assertThat(result.readAllBytes()).isEqualTo(pdfBytes);
        }
        assertThat(requestCaptor.getValue().headers().firstValue("Accept"))
                .hasValue("application/pdf,application/octet-stream;q=0.9,*/*;q=0.1");
    }
}
