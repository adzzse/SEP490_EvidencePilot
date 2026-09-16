package com.evidencepilot.service;

import com.evidencepilot.model.FeedbackAttachment;
import com.evidencepilot.model.FeedbackReply;
import com.evidencepilot.model.InstructorFeedback;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.ProjectMedia;
import com.evidencepilot.model.User;
import com.evidencepilot.repository.FeedbackAttachmentRepository;
import com.evidencepilot.repository.ProjectMediaRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class FeedbackAttachmentService {

    public static final int GET_URL_TTL_MINUTES = 60;
    public static final int MAX_PER_MESSAGE = 5;

    private static final Map<String, String> ALLOWED_MIME_TO_EXTENSION = Map.of(
            "image/png", "png",
            "image/jpeg", "jpg",
            "image/gif", "gif",
            "image/webp", "webp");

    private final FeedbackAttachmentRepository attachmentRepository;
    private final ProjectMediaRepository projectMediaRepository;
    private final DocumentObjectStorage objectStorage;

    /**
     * Links library assets onto a thread (reply null) or a reply by cloning
     * bytes server-side into a feedback-owned key, then severing the tie: the
     * row points only at the clone, so student library cleanup can never break
     * published feedback. mime/size are copied 1:1 from the library row.
     *
     * Accepted systemic risk: copy-then-insert leaves a narrow crash window
     * (clone written, JVM dead before commit, rollback hook never fires). A few
     * kilobytes per one-in-a-million hard crash is cheaper than a saga — no
     * sweeper, no bucket reconciliation.
     */
    @Transactional
    public void linkMediaAssets(List<UUID> mediaAssetIds, Project project, User actor,
                                InstructorFeedback feedback, FeedbackReply reply) {
        if (mediaAssetIds == null || mediaAssetIds.isEmpty()) return;
        List<UUID> distinct = mediaAssetIds.stream().distinct().toList();
        long alreadyOnTarget = reply == null
                ? attachmentRepository.findByFeedbackId(feedback.getId()).stream()
                        .filter(a -> a.getReply() == null).count()
                : attachmentRepository.findByFeedbackId(feedback.getId()).stream()
                        .filter(a -> a.getReply() != null
                                && Objects.equals(a.getReply().getId(), reply.getId())).count();
        if (alreadyOnTarget + distinct.size() > MAX_PER_MESSAGE) {
            throw badRequest("At most " + MAX_PER_MESSAGE + " attachments per message.");
        }
        List<ProjectMedia> assets = projectMediaRepository.findAllById(distinct);
        if (assets.size() != distinct.size()) throw badRequest("Unknown media asset id.");
        LocalDateTime now = LocalDateTime.now();
        for (ProjectMedia asset : assets) {
            if (asset.getProject() == null
                    || !Objects.equals(asset.getProject().getId(), project.getId())) {
                throw badRequest("Media asset does not belong to this project.");
            }
            if (!ALLOWED_MIME_TO_EXTENSION.containsKey(asset.getMimeType())) {
                throw badRequest("Only PNG, JPEG, GIF or WebP images can be attached.");
            }
            Long sizeBytes = asset.getFileSizeBytes() != null
                    ? asset.getFileSizeBytes()
                    : statOnceAndPersist(asset);
            String extension = ALLOWED_MIME_TO_EXTENSION.get(asset.getMimeType());
            String destKey = "feedback/" + project.getId() + "/" + UUID.randomUUID() + "." + extension;
            try {
                objectStorage.copy(asset.getStorageKey(), destKey);
            } catch (DocumentObjectStorage.DocumentStorageException e) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "Media asset is no longer in the library.", e);
            }
            objectStorage.deleteOnRollback(destKey);
            FeedbackAttachment row = new FeedbackAttachment();
            row.setFeedback(feedback);
            row.setReply(reply);
            row.setProject(project);
            row.setMediaAsset(asset);
            row.setStorageKey(destKey);
            row.setMimeType(asset.getMimeType());
            row.setFileSizeBytes(sizeBytes);
            row.setUploadedBy(actor);
            row.setCreatedAt(now);
            attachmentRepository.save(row);
        }
    }

    public String readUrl(FeedbackAttachment attachment) {
        return objectStorage.presignedGetUrl(attachment.getStorageKey(), GET_URL_TTL_MINUTES);
    }

    /**
     * Single stat per legacy library row (pre-size-column uploads), persisted
     * back so every later link is a pure database copy with zero MinIO calls.
     */
    private Long statOnceAndPersist(ProjectMedia asset) {
        long size;
        try {
            size = objectStorage.contentLength(asset.getStorageKey());
        } catch (DocumentObjectStorage.DocumentStorageException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Media asset is no longer in the library.", e);
        }
        if (size <= 0) throw badRequest("Media asset is empty.");
        asset.setFileSizeBytes(size);
        projectMediaRepository.save(asset);
        return size;
    }

    private static ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
