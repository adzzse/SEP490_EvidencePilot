package com.evidencepilot.support;

import com.evidencepilot.dto.request.PagingRequest;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Sort;
import org.springframework.web.server.ResponseStatusException;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PagingRequestTest {

    @Test
    void pageableClampsSizeAndAppliesWhitelistedSort() {
        var pageable = PagingRequest.pageable(
                1,
                250,
                "createdAt,desc",
                Set.of("createdAt", "title"),
                "title,asc");

        assertThat(pageable.getPageNumber()).isEqualTo(1);
        assertThat(pageable.getPageSize()).isEqualTo(100);
        assertThat(pageable.getSort().getOrderFor("createdAt"))
                .extracting(Sort.Order::getDirection)
                .isEqualTo(Sort.Direction.DESC);
    }

    @Test
    void pageableRejectsUnknownSortField() {
        assertThatThrownBy(() -> PagingRequest.pageable(
                0,
                20,
                "passwordHash,desc",
                Set.of("createdAt", "title"),
                "createdAt,desc"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Unsupported sort field");
    }

    @Test
    void pageableUsesDefaultSortWhenSortIsBlank() {
        var pageable = PagingRequest.pageable(
                0,
                20,
                " ",
                Set.of("createdAt", "title"),
                "createdAt,desc");

        assertThat(pageable.getSort().getOrderFor("createdAt"))
                .extracting(Sort.Order::getDirection)
                .isEqualTo(Sort.Direction.DESC);
    }
}
