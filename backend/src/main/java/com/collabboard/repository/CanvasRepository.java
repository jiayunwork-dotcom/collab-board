package com.collabboard.repository;

import com.collabboard.entity.Canvas;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface CanvasRepository extends JpaRepository<Canvas, UUID> {
    List<Canvas> findByOwnerIdOrderByUpdatedAtDesc(UUID ownerId);

    @Query("SELECT c FROM Canvas c WHERE c.isPublic = true ORDER BY c.updatedAt DESC")
    List<Canvas> findPublicCanvases();
}
