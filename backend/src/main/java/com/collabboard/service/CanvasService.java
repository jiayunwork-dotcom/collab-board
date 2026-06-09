package com.collabboard.service;

import com.collabboard.dto.*;
import com.collabboard.entity.Canvas;
import com.collabboard.entity.CanvasConnection;
import com.collabboard.entity.CanvasElement;
import com.collabboard.entity.CanvasPermission;
import com.collabboard.repository.CanvasConnectionRepository;
import com.collabboard.repository.CanvasElementRepository;
import com.collabboard.repository.CanvasPermissionRepository;
import com.collabboard.repository.CanvasRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Service
public class CanvasService {

    private final CanvasRepository canvasRepository;
    private final CanvasElementRepository elementRepository;
    private final CanvasConnectionRepository connectionRepository;
    private final CanvasPermissionRepository permissionRepository;
    private final UserService userService;
    private final ObjectMapper objectMapper;

    public CanvasService(CanvasRepository canvasRepository,
                         CanvasElementRepository elementRepository,
                         CanvasConnectionRepository connectionRepository,
                         CanvasPermissionRepository permissionRepository,
                         UserService userService,
                         ObjectMapper objectMapper) {
        this.canvasRepository = canvasRepository;
        this.elementRepository = elementRepository;
        this.connectionRepository = connectionRepository;
        this.permissionRepository = permissionRepository;
        this.userService = userService;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public CanvasDto createCanvas(UUID ownerId, CanvasDto dto) {
        Canvas canvas = Canvas.builder()
                .ownerId(ownerId)
                .title(dto.getTitle() != null ? dto.getTitle() : "Untitled")
                .description(dto.getDescription())
                .isPublic(dto.getIsPublic() != null ? dto.getIsPublic() : false)
                .backgroundType(dto.getBackgroundType() != null ? dto.getBackgroundType() : "GRID_DOTS")
                .backgroundColor(dto.getBackgroundColor() != null ? dto.getBackgroundColor() : "#FFFFFF")
                .gridSize(dto.getGridSize() != null ? dto.getGridSize() : 20)
                .viewportX(0.0)
                .viewportY(0.0)
                .viewportZoom(1.0)
                .build();
        canvas = canvasRepository.save(canvas);

        CanvasPermission permission = CanvasPermission.builder()
                .canvasId(canvas.getId())
                .userId(ownerId)
                .role(CanvasPermission.Role.OWNER)
                .build();
        permissionRepository.save(permission);

        return toDto(canvas);
    }

    public FullCanvasDto getFullCanvas(UUID canvasId, UUID userId) {
        Canvas canvas = canvasRepository.findById(canvasId)
                .orElseThrow(() -> new RuntimeException("Canvas not found"));

        checkReadPermission(canvas, userId);

        List<CanvasElement> elements = elementRepository.findByCanvasIdOrderByZIndexAsc(canvasId);
        List<CanvasConnection> connections = connectionRepository.findByCanvasIdOrderByZIndexAsc(canvasId);

        Map<String, Object> viewport = new HashMap<>();
        viewport.put("x", canvas.getViewportX());
        viewport.put("y", canvas.getViewportY());
        viewport.put("zoom", canvas.getViewportZoom());

        return FullCanvasDto.builder()
                .canvas(toDto(canvas))
                .elements(elements.stream().map(this::toElementDto).toList())
                .connections(connections.stream().map(this::toConnectionDto).toList())
                .viewport(viewport)
                .build();
    }

    public List<CanvasDto> getUserCanvases(UUID userId) {
        List<CanvasPermission> permissions = permissionRepository.findByUserId(userId);
        List<UUID> canvasIds = permissions.stream()
                .map(CanvasPermission::getCanvasId)
                .toList();

        List<Canvas> owned = canvasRepository.findByOwnerIdOrderByUpdatedAtDesc(userId);
        Set<Canvas> allCanvases = new LinkedHashSet<>(owned);

        if (!canvasIds.isEmpty()) {
            allCanvases.addAll(canvasRepository.findAllById(canvasIds));
        }

        return allCanvases.stream()
                .sorted((a, b) -> b.getUpdatedAt().compareTo(a.getUpdatedAt()))
                .map(this::toDto)
                .toList();
    }

    public List<CanvasDto> getPublicCanvases() {
        return canvasRepository.findPublicCanvases().stream()
                .map(this::toDto)
                .toList();
    }

    @Transactional
    public CanvasDto updateCanvas(UUID canvasId, UUID userId, CanvasDto dto) {
        Canvas canvas = canvasRepository.findById(canvasId)
                .orElseThrow(() -> new RuntimeException("Canvas not found"));

        checkEditPermission(canvasId, userId);

        if (dto.getTitle() != null) canvas.setTitle(dto.getTitle());
        if (dto.getDescription() != null) canvas.setDescription(dto.getDescription());
        if (dto.getThumbnailUrl() != null) canvas.setThumbnailUrl(dto.getThumbnailUrl());
        if (dto.getIsPublic() != null) canvas.setIsPublic(dto.getIsPublic());
        if (dto.getBackgroundType() != null) canvas.setBackgroundType(dto.getBackgroundType());
        if (dto.getBackgroundColor() != null) canvas.setBackgroundColor(dto.getBackgroundColor());
        if (dto.getGridSize() != null) canvas.setGridSize(dto.getGridSize());
        if (dto.getViewportX() != null) canvas.setViewportX(dto.getViewportX());
        if (dto.getViewportY() != null) canvas.setViewportY(dto.getViewportY());
        if (dto.getViewportZoom() != null) canvas.setViewportZoom(dto.getViewportZoom());

        return toDto(canvasRepository.save(canvas));
    }

    @Transactional
    public void deleteCanvas(UUID canvasId, UUID userId) {
        Canvas canvas = canvasRepository.findById(canvasId)
                .orElseThrow(() -> new RuntimeException("Canvas not found"));

        if (!canvas.getOwnerId().equals(userId)) {
            throw new RuntimeException("Only owner can delete canvas");
        }

        elementRepository.deleteByCanvasId(canvasId);
        connectionRepository.deleteByCanvasId(canvasId);
        canvasRepository.delete(canvas);
    }

    public void checkReadPermission(Canvas canvas, UUID userId) {
        if (Boolean.TRUE.equals(canvas.getIsPublic())) {
            return;
        }
        if (userId != null && canvas.getOwnerId().equals(userId)) {
            return;
        }
        if (userId == null) {
            throw new RuntimeException("Authentication required");
        }
        permissionRepository.findByCanvasIdAndUserId(canvas.getId(), userId)
                .orElseThrow(() -> new RuntimeException("No permission to view this canvas"));
    }

    public void checkEditPermission(UUID canvasId, UUID userId) {
        if (userId == null) {
            throw new RuntimeException("Authentication required");
        }
        Canvas canvas = canvasRepository.findById(canvasId)
                .orElseThrow(() -> new RuntimeException("Canvas not found"));

        if (canvas.getOwnerId().equals(userId)) {
            return;
        }
        CanvasPermission perm = permissionRepository.findByCanvasIdAndUserId(canvasId, userId)
                .orElseThrow(() -> new RuntimeException("No permission"));
        if (perm.getRole() != CanvasPermission.Role.EDITOR && perm.getRole() != CanvasPermission.Role.OWNER) {
            throw new RuntimeException("Edit permission required");
        }
    }

    public void checkCommentPermission(UUID canvasId, UUID userId) {
        if (userId == null) {
            throw new RuntimeException("Authentication required");
        }
        Canvas canvas = canvasRepository.findById(canvasId)
                .orElseThrow(() -> new RuntimeException("Canvas not found"));
        if (canvas.getOwnerId().equals(userId)) return;
        CanvasPermission perm = permissionRepository.findByCanvasIdAndUserId(canvasId, userId)
                .orElseThrow(() -> new RuntimeException("No permission"));
        if (perm.getRole() == CanvasPermission.Role.VIEWER) {
            throw new RuntimeException("Commenter or higher permission required");
        }
    }

    public CanvasPermission.Role getUserRole(UUID canvasId, UUID userId) {
        Canvas canvas = canvasRepository.findById(canvasId).orElseThrow();
        if (userId != null && canvas.getOwnerId().equals(userId)) {
            return CanvasPermission.Role.OWNER;
        }
        if (userId == null) return null;
        return permissionRepository.findByCanvasIdAndUserId(canvasId, userId)
                .map(CanvasPermission::getRole)
                .orElse(null);
    }

    public Map<String, Object> serializeCanvasData(UUID canvasId) {
        List<CanvasElement> elements = elementRepository.findByCanvasIdOrderByZIndexAsc(canvasId);
        List<CanvasConnection> connections = connectionRepository.findByCanvasIdOrderByZIndexAsc(canvasId);

        Map<String, Object> data = new HashMap<>();
        data.put("elements", elements.stream().map(this::toElementMap).toList());
        data.put("connections", connections.stream().map(this::toConnectionMap).toList());
        return data;
    }

    private Map<String, Object> toElementMap(CanvasElement e) {
        return objectMapper.convertValue(toElementDto(e), Map.class);
    }

    private Map<String, Object> toConnectionMap(CanvasConnection c) {
        return objectMapper.convertValue(toConnectionDto(c), Map.class);
    }

    public CanvasDto toDto(Canvas c) {
        return CanvasDto.builder()
                .id(c.getId())
                .ownerId(c.getOwnerId())
                .title(c.getTitle())
                .description(c.getDescription())
                .thumbnailUrl(c.getThumbnailUrl())
                .isPublic(c.getIsPublic())
                .backgroundType(c.getBackgroundType())
                .backgroundColor(c.getBackgroundColor())
                .gridSize(c.getGridSize())
                .viewportX(c.getViewportX())
                .viewportY(c.getViewportY())
                .viewportZoom(c.getViewportZoom())
                .createdAt(c.getCreatedAt())
                .updatedAt(c.getUpdatedAt())
                .build();
    }

    public CanvasElementDto toElementDto(CanvasElement e) {
        return CanvasElementDto.builder()
                .id(e.getId())
                .canvasId(e.getCanvasId())
                .parentId(e.getParentId())
                .type(e.getType())
                .x(e.getX())
                .y(e.getY())
                .width(e.getWidth())
                .height(e.getHeight())
                .rotation(e.getRotation())
                .zIndex(e.getZIndex())
                .opacity(e.getOpacity())
                .locked(e.getLocked())
                .visible(e.getVisible())
                .groupId(e.getGroupId())
                .data(e.getData())
                .versionVector(e.getVersionVector())
                .lastModifiedBy(e.getLastModifiedBy())
                .lastModifiedAt(e.getLastModifiedAt())
                .createdAt(e.getCreatedAt())
                .build();
    }

    public CanvasConnectionDto toConnectionDto(CanvasConnection c) {
        return CanvasConnectionDto.builder()
                .id(c.getId())
                .canvasId(c.getCanvasId())
                .fromElementId(c.getFromElementId())
                .toElementId(c.getToElementId())
                .fromPoint(c.getFromPoint())
                .toPoint(c.getToPoint())
                .style(c.getStyle())
                .arrowStyle(c.getArrowStyle())
                .color(c.getColor())
                .thickness(c.getThickness())
                .label(c.getLabel())
                .waypoints(c.getWaypoints())
                .zIndex(c.getZIndex())
                .versionVector(c.getVersionVector())
                .createdAt(c.getCreatedAt())
                .updatedAt(c.getUpdatedAt())
                .build();
    }
}
