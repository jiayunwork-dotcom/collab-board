package com.collabboard.repository;

import com.collabboard.entity.OperationLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Repository
public interface OperationLogRepository extends JpaRepository<OperationLog, Long> {
    List<OperationLog> findByCanvasIdAndTimestampBetweenOrderByTimestampAsc(
            UUID canvasId, OffsetDateTime start, OffsetDateTime end);

    @Modifying
    @Query("DELETE FROM OperationLog l WHERE l.canvasId = :canvasId")
    void deleteByCanvasId(UUID canvasId);
}
