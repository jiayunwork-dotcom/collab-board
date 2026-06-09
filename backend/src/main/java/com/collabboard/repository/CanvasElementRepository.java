package com.collabboard.repository;

import com.collabboard.entity.CanvasElement;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface CanvasElementRepository extends JpaRepository<CanvasElement, UUID> {
    List<CanvasElement> findByCanvasIdOrderByZIndexAsc(UUID canvasId);

    List<CanvasElement> findByCanvasIdAndGroupId(UUID canvasId, UUID groupId);

    @Modifying
    @Query("DELETE FROM CanvasElement e WHERE e.canvasId = :canvasId")
    void deleteByCanvasId(UUID canvasId);

    @Query("SELECT MAX(e.zIndex) FROM CanvasElement e WHERE e.canvasId = :canvasId")
    Integer findMaxZIndexByCanvasId(UUID canvasId);
}
