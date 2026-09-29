package com.evidencepilot.service;

import com.evidencepilot.model.AuditLog;
import com.evidencepilot.model.Document;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.AccountStatus;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.ProcessingStatus;
import com.evidencepilot.model.enums.UserRole;
import com.evidencepilot.repository.AuditLogRepository;
import com.evidencepilot.repository.DocumentRepository;
import com.evidencepilot.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
class UploadAuditGapTest {

    @Autowired private AuditLogRepository auditLogs;
    @Autowired private DocumentRepository documents;
    @Autowired private UserRepository users;

    @Test
    void findsActiveDocumentsMissingUploadAudit() {
        User actor = actor();
        Document orphan = document(true, actor);
        Document covered = document(true, actor);
        Document inactive = document(false, actor);
        AuditLog row = new AuditLog();
        row.setAction("DOCUMENT_UPLOADED");
        row.setEntityType("DOCUMENT");
        row.setEntityId(covered.getId());
        row.setActor(actor);
        row.setOccurredAt(LocalDateTime.now());
        auditLogs.save(row);

        List<UUID> orphans = auditLogs.findActiveDocumentIdsMissingUploadAudit();

        assertThat(orphans).containsExactlyInAnyOrder(orphan.getId());
        assertThat(orphans).doesNotContain(inactive.getId());
    }

    private User actor() {
        User actor = new User();
        actor.setEmail("gap-" + UUID.randomUUID() + "@test.com");
        actor.setPasswordHash("hash");
        actor.setRole(UserRole.ADMIN);
        actor.setAccountStatus(AccountStatus.ACTIVE);
        return users.save(actor);
    }

    private Document document(boolean active, User uploadedBy) {
        Document document = new Document();
        document.setDocType(DocumentType.SOURCE);
        document.setFileUrl("pending");
        document.setProcessingStatus(ProcessingStatus.PENDING_UPLOAD);
        document.setActive(active);
        document.setUploadedBy(uploadedBy);
        document.setDownloadToken(UUID.randomUUID().toString());
        return documents.save(document);
    }
}
