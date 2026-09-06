package com.evidencepilot.service;

import com.evidencepilot.dto.request.FeedbackAnchorRequest;
import com.evidencepilot.dto.request.SectionContentUpdateRequest.TextChange;
import com.evidencepilot.dto.response.FeedbackAnchor;
import com.evidencepilot.dto.response.FeedbackAnchor.Projection;
import com.evidencepilot.dto.response.FeedbackAnchor.Target;
import com.evidencepilot.model.InstructorFeedback;
import com.evidencepilot.model.PaperSection;
import com.evidencepilot.repository.InstructorFeedbackRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class FeedbackAnchorService {
    public static final String REPRESENTATION = "latex-source-lf-v1";
    private static final Pattern LINES = Pattern.compile("^(\\d+)(?:\\s*[-–]\\s*(\\d+))?$");
    private final InstructorFeedbackRepository repository;
    private final ObjectMapper mapper;

    public FeedbackAnchor resolve(InstructorFeedback feedback, String content, Integer version) {
        String text = normalize(content);
        FeedbackAnchor anchor = read(feedback);
        if (anchor == null) anchor = create(feedback, text, version, null);
        if (Objects.equals(anchor.current().contentVersion(), version)
                && fingerprint(text).equals(anchor.current().fingerprint())) return anchor;
        return recover(anchor, text, version);
    }

    public void initialize(InstructorFeedback feedback, FeedbackAnchorRequest request) {
        PaperSection section = feedback.getSection();
        FeedbackAnchor anchor = create(feedback, normalize(section.getContentTex()), section.getVersion(), request);
        write(feedback, recover(anchor, normalize(section.getContentTex()), section.getVersion()));
    }

    // Called inside the section save transaction; the original review target never changes here.
    public void contentChanged(PaperSection section, String before, String after,
                               Integer oldVersion, Integer newVersion, List<TextChange> changes) {
        String previous = normalize(before);
        String next = normalize(after);
        for (InstructorFeedback feedback : repository.findBySectionId(section.getId())) {
            FeedbackAnchor anchor = resolve(feedback, previous, oldVersion);
            write(feedback, remap(anchor, previous, next, newVersion, changes));
        }
    }

    public static void validateChanges(String before, String after, List<TextChange> changes) {
        if (changes == null) return;
        String source = normalize(before);
        if (changes.size() > 10000) throw invalid("Too many source changes.");
        StringBuilder rebuilt = new StringBuilder();
        int cursor = 0;
        long inserted = 0;
        for (TextChange change : changes) {
            if (change == null || change.from() == null || change.to() == null || change.insert() == null
                    || change.from() < cursor || change.to() < change.from()
                    || !boundary(source, change.from()) || !boundary(source, change.to())) {
                throw invalid("Invalid source change range.");
            }
            String insert = normalize(change.insert());
            inserted += insert.length();
            if (inserted > 5_000_000) throw invalid("Source changes are too large.");
            rebuilt.append(source, cursor, change.from()).append(insert);
            cursor = change.to();
        }
        rebuilt.append(source, cursor, source.length());
        if (!rebuilt.toString().equals(normalize(after))) {
            throw invalid("Source changes do not reconstruct the submitted content.");
        }
    }

    public static FeedbackAnchor remap(FeedbackAnchor anchor, String before, String after,
                                       Integer version, List<TextChange> changes) {
        Projection current = anchor.current();
        if (anchor.original() == null) return recover(anchor, after, version);
        if (changes == null || current.from() == null || current.to() == null
                || !fingerprint(before).equals(current.fingerprint())) return recover(anchor, after, version);
        for (TextChange change : changes) {
            // A bulk replacement containing surrounding text has no trustworthy positional correspondence.
            if (change.from() <= current.from() && change.to() >= current.to()
                    && (change.from() < current.from() || change.to() > current.to())) {
                return recover(anchor, after, version);
            }
        }
        int from = mapPosition(current.from(), 1, changes);
        int to = mapPosition(current.to(), -1, changes);
        if (from >= to || !boundary(after, from) || !boundary(after, to)) return new FeedbackAnchor(anchor.original(),
                new Projection("DETACHED", version, fingerprint(after), null, null));
        String status = after.substring(from, to).equals(anchor.original().exact()) ? "ATTACHED" : "MODIFIED";
        return new FeedbackAnchor(anchor.original(), new Projection(status, version, fingerprint(after), from, to));
    }

    private static int mapPosition(int position, int association, List<TextChange> changes) {
        int delta = 0;
        for (TextChange change : changes) {
            int inserted = normalize(change.insert()).length();
            if (position < change.from()) break;
            if (position <= change.to()) {
                if (change.from().equals(change.to())) {
                    return change.from() + delta + (association > 0 ? inserted : 0);
                }
                if (position == change.from()) return change.from() + delta;
                if (position == change.to()) return change.from() + delta + inserted;
                return change.from() + delta + (association > 0 ? inserted : 0);
            }
            delta += inserted - (change.to() - change.from());
        }
        return position + delta;
    }

    private FeedbackAnchor create(InstructorFeedback feedback, String currentText, Integer currentVersion,
                                   FeedbackAnchorRequest request) {
        Source source = reviewedSource(feedback, currentText, currentVersion);
        String reference = feedback.getLineReference();
        if (request == null && (reference == null || reference.isBlank())) {
            return new FeedbackAnchor(null, new Projection("SECTION", currentVersion, fingerprint(currentText), null, null));
        }
        if (source == null) {
            if (request != null) throw invalid("The reviewed source is unavailable; a range cannot be verified.");
            return new FeedbackAnchor(null, new Projection("UNLOCATED", currentVersion, fingerprint(currentText), null, null));
        }
        int from;
        int to;
        if (request != null) {
            if (!REPRESENTATION.equals(request.representation()) || !"utf16".equals(request.offsetUnit())
                    || !Objects.equals(source.version(), request.contentVersion())
                    || !fingerprint(source.text()).equals(request.fingerprint())
                    || request.from() == null || request.to() == null
                    || !boundary(source.text(), request.from()) || !boundary(source.text(), request.to())
                    || request.from() >= request.to()) throw invalid("Anchor does not match the reviewed source.");
            from = request.from();
            to = request.to();
        } else {
            int[] range = lineRange(source.text(), reference);
            if (range == null) return new FeedbackAnchor(null,
                    new Projection("UNLOCATED", currentVersion, fingerprint(currentText), null, null));
            from = range[0];
            to = range[1];
        }
        int prefixStart = Math.max(0, from - 64);
        if (!boundary(source.text(), prefixStart)) prefixStart++;
        int suffixEnd = Math.min(source.text().length(), to + 64);
        if (!boundary(source.text(), suffixEnd)) suffixEnd--;
        Target target = new Target(REPRESENTATION, "utf16", source.version(), fingerprint(source.text()), from, to,
                source.text().substring(from, to), source.text().substring(prefixStart, from),
                source.text().substring(to, suffixEnd));
        return new FeedbackAnchor(target, new Projection("ATTACHED", source.version(), target.fingerprint(), from, to));
    }

    private Source reviewedSource(InstructorFeedback feedback, String currentText, Integer currentVersion) {
        String snapshot = feedback.getRequest().getSubmissionSnapshotJson();
        if (snapshot != null && !snapshot.isBlank()) {
            try {
                for (var paper : mapper.readTree(snapshot).path("papers")) {
                    for (var section : paper.path("sections")) {
                        if (feedback.getSection().getId().toString().equals(section.path("id").asText())
                                && section.path("contentTex").isTextual()
                                && section.path("contentVersion").canConvertToInt()
                                && Objects.equals(feedback.getSectionVersion(), section.path("contentVersion").asInt())) {
                            return new Source(normalize(section.path("contentTex").asText()), section.path("contentVersion").asInt());
                        }
                    }
                }
                return null;
            } catch (JsonProcessingException exception) {
                throw new IllegalStateException("Stored review snapshot is invalid", exception);
            }
        }
        return Objects.equals(feedback.getSectionVersion(), currentVersion)
                ? new Source(currentText, currentVersion) : null;
    }

    private static int[] lineRange(String text, String reference) {
        var matcher = LINES.matcher(reference.trim());
        if (!matcher.matches()) return null;
        try {
            int first = Integer.parseInt(matcher.group(1));
            int last = matcher.group(2) == null ? first : Integer.parseInt(matcher.group(2));
            if (first < 1 || last < first) return null;
            int from = 0;
            for (int line = 1; line < first; line++) {
                from = text.indexOf('\n', from);
                if (from < 0) return null;
                from++;
            }
            int to = from;
            for (int line = first; line <= last; line++) {
                int end = text.indexOf('\n', to);
                if (end < 0) {
                    if (line != last) return null;
                    to = text.length();
                } else to = line == last ? end : end + 1;
            }
            return to > from ? new int[]{from, to} : null;
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    public static FeedbackAnchor recover(FeedbackAnchor anchor, String text, Integer version) {
        Target original = anchor.original();
        String hash = fingerprint(text);
        if (original == null) return new FeedbackAnchor(null,
                new Projection(anchor.current().status(), version, hash, null, null));
        // Original offsets are authoritative only when the complete original source matches (including undo/rollback).
        if (hash.equals(original.fingerprint())) return new FeedbackAnchor(original,
                new Projection("ATTACHED", version, hash, original.from(), original.to()));
        int contextual = -1;
        int contextCount = 0;
        for (int at = text.indexOf(original.exact()); at >= 0; at = text.indexOf(original.exact(), at + 1)) {
            int end = at + original.exact().length();
            if (at >= original.prefix().length()
                    && text.regionMatches(at - original.prefix().length(), original.prefix(), 0, original.prefix().length())
                    && text.startsWith(original.suffix(), end)) {
                contextual = at;
                contextCount++;
            }
        }
        int from = contextCount == 1 ? contextual : -1;
        return new FeedbackAnchor(original, new Projection(from < 0 ? "DETACHED" : "ATTACHED", version, hash,
                from < 0 ? null : from, from < 0 ? null : from + original.exact().length()));
    }

    private FeedbackAnchor read(InstructorFeedback feedback) {
        if (feedback.getAnchorJson() == null) return null;
        try {
            return mapper.readValue(feedback.getAnchorJson(), FeedbackAnchor.class);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Stored feedback anchor is invalid", exception);
        }
    }

    private void write(InstructorFeedback feedback, FeedbackAnchor anchor) {
        try {
            feedback.setAnchorJson(mapper.writeValueAsString(anchor));
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Feedback anchor could not be stored", exception);
        }
    }

    public static String normalize(String text) {
        return text == null ? "" : text.replace("\r\n", "\n").replace('\r', '\n');
    }

    public static String fingerprint(String text) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(normalize(text).getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private static boolean boundary(String text, int offset) {
        return offset >= 0 && offset <= text.length() && !(offset > 0 && offset < text.length()
                && Character.isHighSurrogate(text.charAt(offset - 1)) && Character.isLowSurrogate(text.charAt(offset)));
    }

    private static ResponseStatusException invalid(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    private record Source(String text, Integer version) {}
}
