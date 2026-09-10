package com.evidencepilot.repository;

import com.evidencepilot.model.Collection;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import java.util.List;
import java.util.UUID;

public interface CollectionRepository extends JpaRepository<Collection, UUID>, JpaSpecificationExecutor<Collection> {

    long countByActiveTrue();

    List<Collection> findByInstructorIdAndActiveTrue(UUID instructorId);
}
