package com.collabboard.repository;

import com.collabboard.entity.CanvasPermission;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface CanvasPermissionRepository extends JpaRepository<CanvasPermission, UUID> {
    List<CanvasPermission> findByCanvasId(UUID canvasId);
    List<CanvasPermission> findByUserId(UUID userId);
    Optional<CanvasPermission> findByCanvasIdAndUserId(UUID canvasId, UUID userId);
    Optional<CanvasPermission> findByInviteToken(String inviteToken);
    void deleteByCanvasIdAndUserId(UUID canvasId, UUID userId);
}
