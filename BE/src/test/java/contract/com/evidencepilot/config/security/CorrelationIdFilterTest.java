package com.evidencepilot.config.security;

import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class CorrelationIdFilterTest {

    private final CorrelationIdFilter filter = new CorrelationIdFilter();
    private final FilterChain chain = mock(FilterChain.class);

    @AfterEach
    void clearMdc() {
        MDC.clear();
    }

    @Test
    void generatesIdWhenClientSendsNone() throws Exception {
        var request = new MockHttpServletRequest();
        var response = new MockHttpServletResponse();

        filter.doFilter(request, response, chain);

        verify(chain).doFilter(request, response);
        assertThat(response.getHeader(CorrelationIdFilter.HEADER)).isNotBlank();
        assertThat(request.getAttribute(CorrelationIdFilter.MDC_KEY))
                .isEqualTo(response.getHeader(CorrelationIdFilter.HEADER));
        // MDC is request-scoped: cleaned after the chain returns.
        assertThat(MDC.get(CorrelationIdFilter.MDC_KEY)).isNull();
    }

    @Test
    void propagatesClientSuppliedId() throws Exception {
        var request = new MockHttpServletRequest();
        request.addHeader(CorrelationIdFilter.HEADER, "trace-123");
        var response = new MockHttpServletResponse();

        filter.doFilter(request, response, chain);

        assertThat(response.getHeader(CorrelationIdFilter.HEADER)).isEqualTo("trace-123");
    }

    @Test
    void rejectsHeaderInjectionAndOversizedValues() throws Exception {
        var request = new MockHttpServletRequest();
        request.addHeader(CorrelationIdFilter.HEADER, "evil\r\ninjected");
        var response = new MockHttpServletResponse();

        filter.doFilter(request, response, chain);

        assertThat(response.getHeader(CorrelationIdFilter.HEADER))
                .isNotEqualTo("evil\r\ninjected");
        assertThat(response.getHeader(CorrelationIdFilter.HEADER)).isNotBlank();
    }
}
