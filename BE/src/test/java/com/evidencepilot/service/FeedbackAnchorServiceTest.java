package com.evidencepilot.service;

import com.evidencepilot.dto.request.FeedbackAnchorRequest;
import com.evidencepilot.dto.request.SectionContentUpdateRequest.TextChange;
import com.evidencepilot.model.FeedbackRequest;
import com.evidencepilot.model.InstructorFeedback;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.repository.InstructorFeedbackRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class FeedbackAnchorServiceTest {
    private final ObjectMapper mapper = new ObjectMapper();
    private final InstructorFeedbackRepository repository = mock(InstructorFeedbackRepository.class);
    private final FeedbackAnchorService service = new FeedbackAnchorService(repository, mapper);

    @Test
    void validatesUtf16AgainstTheImmutableReviewSnapshot() throws Exception {
        var feedback = feedback("Tiếng Việt 😀\r\nMột đoạn", "2");
        service.initialize(feedback, request("Tiếng Việt 😀\nMột đoạn", 11, 13));
        assertThat(service.resolve(feedback, feedback.getSection().getContentTex(), 1).original().exact()).isEqualTo("😀");
        assertThatThrownBy(() -> service.initialize(feedback, request("Tiếng Việt 😀\nMột đoạn", 12, 13)))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("reviewed source");
        assertThatThrownBy(() -> service.initialize(feedback, request("different", 0, 3)))
                .isInstanceOf(ResponseStatusException.class);
        var original = service.resolve(feedback, feedback.getSection().getContentTex(), 1).original();
        feedback.getSection().setContentTex("New draft");
        feedback.getSection().setVersion(2);
        assertThat(service.resolve(feedback, "New draft", 2).original()).isEqualTo(original);
    }

    @Test
    void derivesLegacyLinesOnlyFromVerifiedSource() throws Exception {
        var feedback = feedback("First\nSecond\nThird", "2-3");
        var anchor = service.resolve(feedback, "First\nSecond\nThird", 1);
        assertThat(anchor.original().exact()).isEqualTo("Second\nThird");
        assertThat(anchor.current().from()).isEqualTo(6);
        feedback.setLineReference("near the conclusion");
        assertThat(service.resolve(feedback, "First\nSecond\nThird", 1).current().status()).isEqualTo("UNLOCATED");
        feedback.setLineReference(null);
        assertThat(service.resolve(feedback, "First\nSecond\nThird", 1).current().status()).isEqualTo("SECTION");
        feedback.setLineReference("2");
        feedback.getRequest().setSubmissionSnapshotJson(null);
        assertThat(service.resolve(feedback, "Other\nDraft", 2).current().status()).isEqualTo("UNLOCATED");
    }

    @Test
    void persistsEditedRangeAcrossSaveAndReloadWithoutChangingOriginal() throws Exception {
        var feedback = feedback("one target tail", null);
        service.initialize(feedback, request("one target tail", 4, 10));
        var original = service.resolve(feedback, "one target tail", 1).original();
        when(repository.findBySectionId(feedback.getSection().getId())).thenReturn(List.of(feedback));
        var changes = List.of(new TextChange(0, 0, "😀"), new TextChange(5, 8, "XYZ"));
        String revised = "😀one tXYZet tail";
        FeedbackAnchorService.validateChanges("one target tail", revised, changes);
        service.contentChanged(feedback.getSection(), "one target tail", revised, 1, 2, changes);
        var reloaded = new FeedbackAnchorService(repository, mapper).resolve(feedback, revised, 2);
        assertThat(reloaded.original()).isEqualTo(original);
        assertThat(reloaded.current().status()).isEqualTo("MODIFIED");
        assertThat(reloaded.current().from()).isEqualTo(6);
        assertThat(reloaded.current().to()).isEqualTo(12);
        assertThat(reloaded.current().fingerprint()).isEqualTo(FeedbackAnchorService.fingerprint(revised));
        service.contentChanged(feedback.getSection(), revised, "one target tail", 2, 3, null);
        assertThat(service.resolve(feedback, "one target tail", 3).current().status()).isEqualTo("ATTACHED");
    }

    @Test
    void deletionDoesNotJumpToAnotherOccurrenceAndUndoRestoresOriginal() throws Exception {
        String before = "A target B target C";
        var feedback = feedback(before, null);
        service.initialize(feedback, request(before, 2, 8));
        var anchor = service.resolve(feedback, before, 1);
        var deleted = FeedbackAnchorService.remap(anchor, before, "A  B target C", 2, List.of(new TextChange(2, 8, "")));
        assertThat(deleted.current().status()).isEqualTo("DETACHED");
        assertThat(deleted.current().from()).isNull();
        var undone = FeedbackAnchorService.recover(deleted, before, 3);
        assertThat(undone.current().from()).isEqualTo(2);
        assertThat(undone.current().to()).isEqualTo(8);
    }

    @Test
    void refusesAmbiguousQuotesAndBulkReplacement() throws Exception {
        var feedback = feedback("target", null);
        service.initialize(feedback, request("target", 0, 6));
        var anchor = service.resolve(feedback, "target", 1);
        assertThat(FeedbackAnchorService.recover(anchor, "target target", 2).current().status()).isEqualTo("DETACHED");
        var second = feedback("A target B", null);
        service.initialize(second, request("A target B", 2, 8));
        var replaced = FeedbackAnchorService.remap(service.resolve(second, "A target B", 1),
                "A target B", "Unrelated text", 2, List.of(new TextChange(0, 10, "Unrelated text")));
        assertThat(replaced.current().status()).isEqualTo("DETACHED");
    }

    @Test
    void rejectsInvalidChangeMapsAndAcceptsCrLfNormalization() {
        FeedbackAnchorService.validateChanges("A\r\n😀B", "A\n😀C", List.of(new TextChange(4, 5, "C")));
        assertThatThrownBy(() -> FeedbackAnchorService.validateChanges("😀", "X", List.of(new TextChange(1, 2, "X"))))
                .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> FeedbackAnchorService.validateChanges("abc", "xyz", List.of(new TextChange(0, 1, "x"))))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("reconstruct");
        assertThatThrownBy(() -> FeedbackAnchorService.validateChanges("abc", "x", List.of(
                new TextChange(0, 2, "x"), new TextChange(1, 3, ""))))
                .isInstanceOf(ResponseStatusException.class);
    }

    private FeedbackAnchorRequest request(String source, int from, int to) {
        return new FeedbackAnchorRequest(from, to, 1, FeedbackAnchorService.fingerprint(source),
                FeedbackAnchorService.REPRESENTATION, "utf16");
    }

    private InstructorFeedback feedback(String text, String reference) throws Exception {
        PaperSection section = new PaperSection();
        section.setId(UUID.randomUUID());
        section.setContentTex(text);
        FeedbackRequest review = new FeedbackRequest();
        review.setSubmissionSnapshotJson(mapper.writeValueAsString(Map.of("papers", List.of(Map.of("sections", List.of(
                Map.of("id", section.getId(), "contentVersion", 1, "contentTex", text)))))));
        InstructorFeedback feedback = new InstructorFeedback();
        feedback.setSection(section);
        feedback.setRequest(review);
        feedback.setSectionVersion(1);
        feedback.setLineReference(reference);
        return feedback;
    }
}
