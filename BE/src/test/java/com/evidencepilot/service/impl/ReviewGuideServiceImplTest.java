package com.evidencepilot.service.impl;

import com.evidencepilot.dto.response.ReviewGuideResponse;
import com.evidencepilot.model.ReviewGuide;
import com.evidencepilot.repository.ReviewGuideRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ReviewGuideServiceImplTest {

    @Test
    void getActiveGuides_requiresCurrentUserAndReturnsActiveGuides() {
        ReviewGuideRepository repo = mock(ReviewGuideRepository.class);
        CurrentUserServiceImpl currentUserService = mock(CurrentUserServiceImpl.class);
        ReviewGuideServiceImpl service = new ReviewGuideServiceImpl(repo, currentUserService, new ObjectMapper());

        ReviewGuide methods = guide("Methods", "A strong methods section is reproducible.",
                "[\"Is the study design stated?\", \"Are procedures reproducible?\"]");
        when(repo.findAllByActiveTrueOrderBySectionTypeAsc()).thenReturn(List.of(methods));

        List<ReviewGuideResponse> result = service.getActiveGuides();

        verify(currentUserService).requireCurrentUser();
        assertThat(result).hasSize(1);
        assertThat(result.get(0).sectionType()).isEqualTo("Methods");
        assertThat(result.get(0).guidance()).isEqualTo("A strong methods section is reproducible.");
        assertThat(result.get(0).checklist())
                .containsExactly("Is the study design stated?", "Are procedures reproducible?");
    }

    @Test
    void getActiveGuides_returnsEmptyChecklistForMissingOrMalformedJson() {
        ReviewGuideRepository repo = mock(ReviewGuideRepository.class);
        CurrentUserServiceImpl currentUserService = mock(CurrentUserServiceImpl.class);
        ReviewGuideServiceImpl service = new ReviewGuideServiceImpl(repo, currentUserService, new ObjectMapper());

        ReviewGuide noJson = guide("Abstract", "A strong abstract is self-contained.", null);
        ReviewGuide badJson = guide("Results", "A strong results section is objective.", "{not json");
        when(repo.findAllByActiveTrueOrderBySectionTypeAsc()).thenReturn(List.of(noJson, badJson));

        List<ReviewGuideResponse> result = service.getActiveGuides();

        assertThat(result).hasSize(2);
        assertThat(result.get(0).checklist()).isEmpty();
        assertThat(result.get(1).checklist()).isEmpty();
    }

    private static ReviewGuide guide(String type, String guidance, String checklistJson) {
        ReviewGuide guide = new ReviewGuide();
        guide.setSectionType(type);
        guide.setGuidance(guidance);
        guide.setChecklistJson(checklistJson);
        guide.setActive(true);
        return guide;
    }
}
