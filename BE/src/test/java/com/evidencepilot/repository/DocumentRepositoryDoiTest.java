package com.evidencepilot.repository;

import com.evidencepilot.model.Document;
import com.evidencepilot.model.Project;
import com.evidencepilot.model.ProjectDocument;
import com.evidencepilot.model.User;
import com.evidencepilot.model.enums.AccountStatus;
import com.evidencepilot.model.enums.DocumentType;
import com.evidencepilot.model.enums.ProcessingStatus;
import com.evidencepilot.model.enums.ProjectStatus;
import com.evidencepilot.model.enums.UserRole;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;

import java.time.LocalDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
class DocumentRepositoryDoiTest {

    @Autowired DocumentRepository documents;
    @Autowired ProjectRepository projects;
    @Autowired ProjectDocumentRepository projectDocuments;
    @Autowired UserRepository users;

    @Test
    void countsOnlyDirectAndSharedSourcesInTargetProject() {
        User owner = users.save(user());
        Project target = projects.save(project("Target"));
        Project other = projects.save(project("Other"));
        documents.save(source(owner, target, "10.1000/DUPLICATE"));
        Document shared = documents.save(source(owner, null, "10.1000/duplicate"));
        documents.save(source(owner, null, "10.1000/duplicate"));
        documents.save(source(owner, other, "10.1000/duplicate"));

        ProjectDocument membership = new ProjectDocument();
        membership.setProject(target);
        membership.setDocument(shared);
        membership.setSharedBy(owner);
        membership.setSharedAt(LocalDateTime.now());
        projectDocuments.save(membership);

        assertThat(documents.countActiveProjectSourcesByDoi(
                target.getId(), DocumentType.SOURCE, "10.1000/duplicate"))
                .isEqualTo(2);
    }

    private static User user() {
        User user = new User();
        user.setEmail("doi-" + UUID.randomUUID() + "@test.com");
        user.setPasswordHash("hash");
        user.setRole(UserRole.STUDENT);
        user.setAccountStatus(AccountStatus.ACTIVE);
        user.setCreatedAt(LocalDateTime.now());
        return user;
    }

    private static Project project(String title) {
        Project project = new Project();
        project.setTitle(title);
        project.setStatus(ProjectStatus.IN_PROGRESS);
        project.setActive(true);
        project.setCreatedAt(LocalDateTime.now());
        return project;
    }

    private static Document source(User owner, Project project, String doi) {
        Document document = new Document();
        document.setProject(project);
        document.setUploadedBy(owner);
        document.setDocType(DocumentType.SOURCE);
        document.setFileUrl("sources/raw/" + UUID.randomUUID() + ".pdf");
        document.setProcessingStatus(ProcessingStatus.READY);
        document.setActive(true);
        document.setDoi(doi);
        document.setDownloadToken(UUID.randomUUID().toString());
        document.setCreatedAt(LocalDateTime.now());
        return document;
    }
}
