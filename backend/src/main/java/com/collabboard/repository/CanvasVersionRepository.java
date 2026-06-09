package com.collabboard.repository;

import com.collabboard.entity.CanvasVersion;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface CanvasVersionRepository extends JpaRepository<CanvasVersion, UUID> {
    List<CanvasVersion> findByCanvasIdAndBranchNameOrderByVersionNumberDesc(UUID canvasId, String branchName);

    @Query("SELECT MAX(v.versionNumber) FROM CanvasVersion v WHERE v.canvasId = :canvasId AND v.branchName = :branchName")
    Integer findMaxVersionNumber(UUID canvasId, String branchName);

    Optional<CanvasVersion> findByCanvasIdAndBranchNameAndVersionNumber(UUID canvasId, String branchName, Integer versionNumber);
}
