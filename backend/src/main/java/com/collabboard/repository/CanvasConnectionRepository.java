package com.collabboard.repository;

import com.collabboard.entity.CanvasConnection;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface CanvasConnectionRepository extends JpaRepository<CanvasConnection, UUID> {
    List<CanvasConnection> findByCanvasIdOrderByZIndexAsc(UUID canvasId);

    List<CanvasConnection> findByFromElementIdOrToElementId(UUID fromElementId, UUID toElementId);

    @Modifying
    @Query("DELETE FROM CanvasConnection c WHERE c.canvasId = :canvasId")
    void deleteByCanvasId(UUID canvasId);
}
