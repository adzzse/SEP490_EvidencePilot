package com.evidencepilot.service.impl;

import com.evidencepilot.dto.response.TraceabilityExportResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.function.Consumer;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

public final class ProjectCsvArchive {
    private ProjectCsvArchive() {}

    public static void writeEntries(TraceabilityExportResponse data, ZipOutputStream zip, String prefix) throws IOException {
        entry(zip, prefix + "project.csv", csv -> {
            row(csv, "project_id", "title", "description", "status", "target_standard", "generated_at");
            row(csv, data.projectId(), data.projectTitle(), data.projectDescription(), data.projectStatus(),
                    data.targetStandard(), data.generatedAt());
        });
        entry(zip, prefix + "papers.csv", csv -> {
            row(csv, "id", "title");
            data.papers().forEach(paper -> row(csv, paper.id(), paper.title()));
        });
        entry(zip, prefix + "sections.csv", csv -> {
            row(csv, "id", "paper_id", "title", "section_order", "word_count", "version",
                    "assigned_user_id", "updated_at", "content_tex");
            data.sections().forEach(section -> row(csv, section.id(), section.paperId(), section.title(),
                    section.sectionOrder(), section.wordCount(), section.version(), section.assignedUserId(),
                    section.updatedAt(), section.contentTex()));
        });
        entry(zip, prefix + "sources.csv", csv -> {
            row(csv, "id", "title", "authors", "publication_year", "doi", "publisher", "filename",
                    "file_size_bytes", "reference_count", "cited_by_count", "openalex_topic",
                    "openalex_subfield", "openalex_field", "openalex_domain", "processing_status");
            data.sources().forEach(source -> row(csv, source.id(), source.title(), source.authors(),
                    source.publicationYear(), source.doi(), source.publisher(), source.filename(),
                    source.fileSizeBytes(), source.referenceCount(), source.citedByCount(), source.openAlexTopic(),
                    source.openAlexSubfield(), source.openAlexField(), source.openAlexDomain(), source.processingStatus()));
        });
        entry(zip, prefix + "source-references.csv", csv -> {
            row(csv, "id", "source_id", "reference_index", "edge_type", "title", "doi", "publication_year", "raw_text");
            data.sourceReferences().forEach(reference -> row(csv, reference.id(), reference.sourceId(),
                    reference.referenceIndex(), reference.edgeType(), reference.title(), reference.doi(),
                    reference.publicationYear(), reference.rawText()));
        });
        entry(zip, prefix + "external-references.csv", csv -> {
            row(csv, "id", "title", "doi", "publication_year");
            data.externalReferences().forEach(ref -> row(csv, ref.id(), ref.title(), ref.doi(), ref.publicationYear()));
        });
        entry(zip, prefix + "source-relations.csv", csv -> {
            row(csv, "from_id", "to_id", "type", "reference_ids");
            data.sourceRelations().forEach(relation -> row(csv, relation.sourceId(), relation.targetId(),
                    relation.type(), relation.referenceIds().stream().map(UUID::toString).toList()));
        });
        entry(zip, prefix + "feedback.csv", csv -> {
            row(csv, "id", "student_id", "instructor_id", "status", "requested_at", "reviewed_at");
            data.feedback().forEach(item -> row(csv, item.id(), item.studentId(), item.instructorId(),
                    item.status(), item.requestedAt(), item.reviewedAt()));
        });
        entry(zip, prefix + "feedback-comments.csv", csv -> {
            row(csv, "id", "request_id", "section_id", "content", "thread_state", "student_note", "published_at");
            data.feedbackComments().forEach(item -> row(csv, item.id(), item.requestId(), item.sectionId(),
                    item.content(), item.threadState(), item.studentNote(), item.publishedAt()));
        });
        entry(zip, prefix + "feedback-replies.csv", csv -> {
            row(csv, "id", "feedback_id", "request_id", "author_id", "author_role", "author_name", "content", "created_at");
            data.feedbackReplies().forEach(reply -> row(csv, reply.id(), reply.feedbackId(), reply.requestId(),
                    reply.authorId(), reply.authorRole(), reply.authorName(), reply.content(), reply.createdAt()));
        });
        entry(zip, prefix + "feedback-attachments.csv", csv -> {
            row(csv, "id", "feedback_id", "reply_id", "mime_type", "file_size_bytes", "archive_path", "created_at");
            data.feedbackAttachments().forEach(attachment -> row(csv, attachment.id(), attachment.feedbackId(),
                    attachment.replyId(), attachment.mimeType(), attachment.fileSizeBytes(),
                    attachment.archivePath(), attachment.createdAt()));
        });
        entry(zip, prefix + "evidence-traces.csv", csv -> {
            row(csv, "id", "round_id", "section_id", "section_title", "finding_index", "suggested_action",
                    "excerpt", "rationale", "source_id", "source_title", "evidence_quote", "evidence_relation",
                    "student_action", "student_explanation", "outcome", "judgment", "instructor_feedback", "created_at");
            data.traces().forEach(trace -> row(csv, trace.id(), trace.roundId(), trace.sectionId(), trace.sectionTitle(),
                    trace.findingIndex(), trace.suggestedAction(), trace.excerpt(), trace.rationale(), trace.sourceId(),
                    trace.sourceTitle(), trace.evidenceQuote(), trace.evidenceRelation(), trace.studentAction(),
                    trace.studentExplanation(), trace.outcome(), trace.judgment(), trace.instructorFeedback(), trace.createdAt()));
        });
        entry(zip, prefix + "member-progress.csv", csv -> {
            row(csv, "user_id", "name", "assigned_sections", "current_words", "saves", "words_added",
                    "words_removed", "last_edited_at", "feedback_resolved", "feedback_open", "edited_sections");
            data.memberProgress().forEach(member -> row(csv, member.userId(), member.userName(),
                    member.assignedSectionCount(), member.currentWordCount(), member.saveCount(), member.wordsAdded(),
                    member.wordsRemoved(), member.lastEditedAt(), member.feedbackResolved(), member.feedbackOpen(),
                    member.editedSections()));
        });
        entry(zip, prefix + "member-progress-daily.csv", csv -> {
            row(csv, "user_id", "date", "saves", "words_added", "words_removed");
            data.memberProgress().forEach(member -> member.dailyWordDeltas().forEach(day ->
                    row(csv, member.userId(), day.date(), day.saveCount(), day.wordsAdded(), day.wordsRemoved())));
        });
    }

    private static void entry(ZipOutputStream zip, String name, Consumer<StringBuilder> content) throws IOException {
        StringBuilder csv = new StringBuilder("\uFEFF");
        content.accept(csv);
        zip.putNextEntry(new ZipEntry(name));
        zip.write(csv.toString().getBytes(StandardCharsets.UTF_8));
        zip.closeEntry();
    }

    private static void row(StringBuilder csv, Object... cells) {
        for (int index = 0; index < cells.length; index++) {
            if (index > 0) csv.append(',');
            Object value = cells[index];
            String cell = value == null ? "" : value instanceof java.util.List<?> list
                    ? String.join(";", list.stream().map(String::valueOf).toList()) : value.toString();
            String start = cell.stripLeading();
            if (!(value instanceof Number) && !start.isEmpty() && "=+@-".indexOf(start.charAt(0)) >= 0) {
                cell = "'" + cell;
            }
            csv.append('"').append(cell.replace("\"", "\"\"")).append('"');
        }
        csv.append('\n');
    }
}
