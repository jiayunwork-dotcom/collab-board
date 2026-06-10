package com.collabboard.repository;

import com.collabboard.entity.Comment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface CommentRepository extends JpaRepository<Comment, UUID> {
    List<Comment> findByCanvasIdOrderByCreatedAtAsc(UUID canvasId);

    List<Comment> findByAttachedElementId(UUID elementId);

    void deleteByCanvasId(UUID canvasId);
}
