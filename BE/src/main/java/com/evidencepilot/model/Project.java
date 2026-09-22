package com.evidencepilot.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import org.hibernate.annotations.JdbcTypeCode;

import lombok.Getter;
import lombok.Setter;
import com.evidencepilot.model.enums.PaperStandard;
import com.evidencepilot.model.enums.ProjectStatus;
import com.evidencepilot.model.enums.ProjectRole;
import com.evidencepilot.model.enums.UserRole;

@Entity
@Table(name = "projects")
@Getter
@Setter
public class Project {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", columnDefinition = "BINARY(16)")
    @JdbcTypeCode(java.sql.Types.BINARY)
    private UUID id;

    @Column(nullable = false)
    private String title;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 50)
    private ProjectStatus status;

    @Enumerated(EnumType.STRING)
    @Column(name = "target_standard", length = 50)
    private PaperStandard targetStandard;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @Version
    @Column(name = "opt_version")
    private Long version;

    @Column(nullable = false)
    private boolean active = true;

    @Column(name = "deletion_scheduled_at")
    private LocalDateTime deletionScheduledAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "status_before_deletion", length = 50)
    private ProjectStatus statusBeforeDeletion;

    @OneToMany(mappedBy = "project")
    private List<ProjectMember> projectMembers;

    @OneToMany(mappedBy = "project")
    private List<Document> projectDocuments;

    @OneToMany(mappedBy = "project")
    private List<ProjectMedia> projectMedia;

    public User getStudent() {
        if (projectMembers == null) {
            return null;
        }
        return projectMembers.stream()
                .map(ProjectMember::getUser)
                .filter(user -> user != null && user.getRole() == UserRole.STUDENT)
                .findFirst()
                .orElse(null);
    }

    public User getInstructor() {
        if (projectMembers == null) {
            return null;
        }
        return projectMembers.stream()
                .filter(member -> member.getRole() == ProjectRole.INSTRUCTOR)
                .map(ProjectMember::getUser)
                .filter(user -> user != null && user.getRole() == UserRole.INSTRUCTOR)
                .findFirst()
                .orElse(null);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o)
            return true;
        if (o == null || getClass() != o.getClass())
            return false;
        Project project = (Project) o;
        return id.equals(project.id);
    }

    @Override
    public int hashCode() {
        return id.hashCode();
    }
}
