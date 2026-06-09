package com.collabboard.service;

import com.collabboard.dto.CanvasConnectionDto;
import com.collabboard.dto.CanvasElementDto;
import com.collabboard.entity.CanvasConnection;
import com.collabboard.entity.CanvasElement;
import com.collabboard.entity.OperationLog;
import com.collabboard.repository.CanvasConnectionRepository;
import com.collabboard.repository.CanvasElementRepository;
import com.collabboard.repository.OperationLogRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.*;

@Service
public class CanvasElementService {

    private final CanvasElementRepository elementRepository;
    private final CanvasConnectionRepository connectionRepository;
    private final OperationLogRepository operationLogRepository;
    private final CanvasService canvasService;
    private final ObjectMapper objectMapper;

    public CanvasElementService(CanvasElementRepository elementRepository,
                                CanvasConnectionRepository connectionRepository,
                                OperationLogRepository operationLogRepository,
                                CanvasService canvasService,
                                ObjectMapper objectMapper) {
        this.elementRepository = elementRepository;
        this.connectionRepository = connectionRepository;
        this.operationLogRepository = operationLogRepository;
        this.canvasService = canvasService;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public CanvasElementDto createElement(UUID canvasId, UUID userId, CanvasElementDto dto) {
        canvasService.checkEditPermission(canvasId, userId);

        Integer maxZ = elementRepository.findMaxZIndexByCanvasId(canvasId);
        int zIndex = (maxZ != null ? maxZ : 0) + 1;

        Map<String, Object> vv = new HashMap<>();
        vv.put(userId.toString(), System.currentTimeMillis());

        CanvasElement element = CanvasElement.builder()
                .canvasId(canvasId)
                .parentId(dto.getParentId())
                .type(dto.getType())
                .x(dto.getX() != null ? dto.getX() : 0.0)
                .y(dto.getY() != null ? dto.getY() : 0.0)
                .width(dto.getWidth() != null ? dto.getWidth() : 100.0)
                .height(dto.getHeight() != null ? dto.getHeight() : 100.0)
                .rotation(dto.getRotation() != null ? dto.getRotation() : 0.0)
                .zIndex(zIndex)
                .opacity(dto.getOpacity() != null ? dto.getOpacity() : 1.0)
                .locked(dto.getLocked() != null ? dto.getLocked() : false)
                .visible(dto.getVisible() != null ? dto.getVisible() : true)
                .groupId(dto.getGroupId())
                .data(dto.getData() != null ? dto.getData() : new HashMap<>())
                .versionVector(vv)
                .lastModifiedBy(userId)
                .lastModifiedAt(OffsetDateTime.now())
                .build();

        element = elementRepository.save(element);
        logOperation(canvasId, userId, "CREATE_ELEMENT", element);
        return canvasService.toElementDto(element);
    }

    @Transactional
    public List<CanvasElementDto> batchCreateElements(UUID canvasId, UUID userId, List<CanvasElementDto> dtos) {
        canvasService.checkEditPermission(canvasId, userId);
        List<CanvasElementDto> results = new ArrayList<>();
        for (CanvasElementDto dto : dtos) {
            results.add(createElement(canvasId, userId, dto));
        }
        return results;
    }

    @Transactional
    public CanvasElementDto updateElement(UUID canvasId, UUID elementId, UUID userId, CanvasElementDto dto) {
        canvasService.checkEditPermission(canvasId, userId);

        CanvasElement element = elementRepository.findById(elementId)
                .orElseThrow(() -> new RuntimeException("Element not found"));

        if (!element.getCanvasId().equals(canvasId)) {
            throw new RuntimeException("Element does not belong to canvas");
        }

        if (Boolean.TRUE.equals(element.getLocked())) {
            throw new RuntimeException("Element is locked");
        }

        applyLwwMerge(element, userId, dto);

        element = elementRepository.save(element);
        logOperation(canvasId, userId, "UPDATE_ELEMENT", element);
        return canvasService.toElementDto(element);
    }

    @Transactional
    public void deleteElement(UUID canvasId, UUID elementId, UUID userId) {
        canvasService.checkEditPermission(canvasId, userId);

        CanvasElement element = elementRepository.findById(elementId)
                .orElseThrow(() -> new RuntimeException("Element not found"));

        if (Boolean.TRUE.equals(element.getLocked())) {
            throw new RuntimeException("Element is locked");
        }

        List<CanvasConnection> relatedConnections = connectionRepository
                .findByFromElementIdOrToElementId(elementId, elementId);
        connectionRepository.deleteAll(relatedConnections);

        elementRepository.delete(element);
        logOperation(canvasId, userId, "DELETE_ELEMENT", element);
    }

    @Transactional
    public void batchDeleteElements(UUID canvasId, List<UUID> elementIds, UUID userId) {
        for (UUID id : elementIds) {
            try {
                deleteElement(canvasId, id, userId);
            } catch (Exception ignored) {
            }
        }
    }

    @Transactional
    public CanvasConnectionDto createConnection(UUID canvasId, UUID userId, CanvasConnectionDto dto) {
        canvasService.checkEditPermission(canvasId, userId);

        Map<String, Object> vv = new HashMap<>();
        vv.put(userId.toString(), System.currentTimeMillis());

        CanvasConnection connection = CanvasConnection.builder()
                .canvasId(canvasId)
                .fromElementId(dto.getFromElementId())
                .toElementId(dto.getToElementId())
                .fromPoint(dto.getFromPoint() != null ? dto.getFromPoint() : "auto")
                .toPoint(dto.getToPoint() != null ? dto.getToPoint() : "auto")
                .style(dto.getStyle() != null ? dto.getStyle() : "curve")
                .arrowStyle(dto.getArrowStyle() != null ? dto.getArrowStyle() : "end")
                .color(dto.getColor() != null ? dto.getColor() : "#374151")
                .thickness(dto.getThickness() != null ? dto.getThickness() : 2.0)
                .label(dto.getLabel())
                .waypoints(dto.getWaypoints() != null ? dto.getWaypoints() : new ArrayList<>())
                .zIndex(0)
                .versionVector(vv)
                .build();

        connection = connectionRepository.save(connection);
        Map<String, Object> data = new HashMap<>();
        data.put("connectionId", connection.getId());
        logOperation(canvasId, userId, "CREATE_CONNECTION", data);
        return canvasService.toConnectionDto(connection);
    }

    @Transactional
    public CanvasConnectionDto updateConnection(UUID canvasId, UUID connId, UUID userId, CanvasConnectionDto dto) {
        canvasService.checkEditPermission(canvasId, userId);

        CanvasConnection conn = connectionRepository.findById(connId)
                .orElseThrow(() -> new RuntimeException("Connection not found"));

        if (dto.getStyle() != null) conn.setStyle(dto.getStyle());
        if (dto.getArrowStyle() != null) conn.setArrowStyle(dto.getArrowStyle());
        if (dto.getColor() != null) conn.setColor(dto.getColor());
        if (dto.getThickness() != null) conn.setThickness(dto.getThickness());
        if (dto.getLabel() != null) conn.setLabel(dto.getLabel());
        if (dto.getWaypoints() != null) conn.setWaypoints(dto.getWaypoints());
        if (dto.getFromPoint() != null) conn.setFromPoint(dto.getFromPoint());
        if (dto.getToPoint() != null) conn.setToPoint(dto.getToPoint());

        conn.getVersionVector().put(userId.toString(), System.currentTimeMillis());

        conn = connectionRepository.save(conn);
        return canvasService.toConnectionDto(conn);
    }

    @Transactional
    public void deleteConnection(UUID canvasId, UUID connId, UUID userId) {
        canvasService.checkEditPermission(canvasId, userId);
        CanvasConnection conn = connectionRepository.findById(connId).orElseThrow();
        connectionRepository.delete(conn);
    }

    private void applyLwwMerge(CanvasElement element, UUID userId, CanvasElementDto dto) {
        long now = System.currentTimeMillis();
        String uid = userId.toString();

        if (dto.getX() != null) element.setX(dto.getX());
        if (dto.getY() != null) element.setY(dto.getY());
        if (dto.getWidth() != null) element.setWidth(dto.getWidth());
        if (dto.getHeight() != null) element.setHeight(dto.getHeight());
        if (dto.getRotation() != null) element.setRotation(dto.getRotation());
        if (dto.getZIndex() != null) element.setZIndex(dto.getZIndex());
        if (dto.getOpacity() != null) element.setOpacity(dto.getOpacity());
        if (dto.getLocked() != null) element.setLocked(dto.getLocked());
        if (dto.getVisible() != null) element.setVisible(dto.getVisible());
        if (dto.getParentId() != null) element.setParentId(dto.getParentId());
        if (dto.getGroupId() != null) element.setGroupId(dto.getGroupId());
        if (dto.getData() != null) element.setData(dto.getData());

        element.getVersionVector().merge(uid, now, (a, b) -> Math.max(((Number) a).longValue(), now));
        element.setLastModifiedBy(userId);
        element.setLastModifiedAt(OffsetDateTime.now());
    }

    private void logOperation(UUID canvasId, UUID userId, String type, Object data) {
        try {
            Map<String, Object> opData;
            if (data instanceof Map) {
                opData = (Map<String, Object>) data;
            } else {
                opData = objectMapper.convertValue(data, Map.class);
            }
            OperationLog log = OperationLog.builder()
                    .canvasId(canvasId)
                    .userId(userId)
                    .operationType(type)
                    .operationData(opData)
                    .build();
            operationLogRepository.save(log);
        } catch (Exception ignored) {
        }
    }
}
