package com.collabboard.service;

import com.collabboard.dto.CanvasConnectionDto;
import com.collabboard.dto.CanvasElementDto;
import com.collabboard.dto.VersionDto;
import com.collabboard.entity.Canvas;
import com.collabboard.entity.CanvasConnection;
import com.collabboard.entity.CanvasElement;
import com.collabboard.entity.CanvasVersion;
import com.collabboard.repository.CanvasConnectionRepository;
import com.collabboard.repository.CanvasElementRepository;
import com.collabboard.repository.CanvasRepository;
import com.collabboard.repository.CanvasVersionRepository;
import com.collabboard.repository.UserRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Service
public class VersionService {

    private final CanvasVersionRepository versionRepository;
    private final CanvasRepository canvasRepository;
    private final UserRepository userRepository;
    private final CanvasService canvasService;
    private final CanvasElementRepository elementRepository;
    private final CanvasConnectionRepository connectionRepository;
    private final ObjectMapper objectMapper;
    private final SimpMessagingTemplate messagingTemplate;
    private final RedisTemplate<String, Object> redisTemplate;

    @Value("${app.version.auto-save-interval:30000}")
    private long autoSaveInterval;

    private final Map<UUID, Long> lastAutoSave = new ConcurrentHashMap<>();

    public VersionService(CanvasVersionRepository versionRepository,
                          CanvasRepository canvasRepository,
                          UserRepository userRepository,
                          CanvasService canvasService,
                          CanvasElementRepository elementRepository,
                          CanvasConnectionRepository connectionRepository,
                          ObjectMapper objectMapper,
                          SimpMessagingTemplate messagingTemplate,
                          RedisTemplate<String, Object> redisTemplate) {
        this.versionRepository = versionRepository;
        this.canvasRepository = canvasRepository;
        this.userRepository = userRepository;
        this.canvasService = canvasService;
        this.elementRepository = elementRepository;
        this.connectionRepository = connectionRepository;
        this.objectMapper = objectMapper;
        this.messagingTemplate = messagingTemplate;
        this.redisTemplate = redisTemplate;
    }

    @Transactional
    public VersionDto createVersion(UUID canvasId, UUID userId, String summary) {
        canvasService.checkEditPermission(canvasId, userId);

        Integer maxVn = versionRepository.findMaxVersionNumber(canvasId, "main");
        int versionNumber = (maxVn != null ? maxVn : 0) + 1;

        Map<String, Object> snapshot = canvasService.serializeCanvasData(canvasId);

        CanvasVersion version = CanvasVersion.builder()
                .canvasId(canvasId)
                .versionNumber(versionNumber)
                .branchName("main")
                .createdBy(userId)
                .summary(summary != null ? summary : "Manual save v" + versionNumber)
                .snapshot(snapshot)
                .operations(new ArrayList<>())
                .build();

        version = versionRepository.save(version);
        return toDto(version);
    }

    public List<VersionDto> getCanvasVersions(UUID canvasId, String branchName, UUID userId) {
        Canvas canvas = canvasRepository.findById(canvasId).orElseThrow();
        canvasService.checkReadPermission(canvas, userId);

        String branch = branchName != null ? branchName : "main";
        List<CanvasVersion> versions = versionRepository
                .findByCanvasIdAndBranchNameOrderByVersionNumberDesc(canvasId, branch);

        Set<UUID> userIds = versions.stream()
                .map(CanvasVersion::getCreatedBy)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<UUID, String> userNames = new HashMap<>();
        if (!userIds.isEmpty()) {
            userNames = userRepository.findAllById(userIds).stream()
                    .collect(Collectors.toMap(u -> u.getId(), u -> u.getUsername()));
        }

        return versions.stream().map(v -> {
            VersionDto dto = toDto(v);
            dto.setCreatedByName(userNames.get(v.getCreatedBy()));
            return dto;
        }).toList();
    }

    public VersionDto getVersion(UUID versionId, UUID userId) {
        CanvasVersion v = versionRepository.findById(versionId).orElseThrow();
        Canvas canvas = canvasRepository.findById(v.getCanvasId()).orElseThrow();
        canvasService.checkReadPermission(canvas, userId);
        return toDto(v);
    }

    public Map<String, Object> getVersionSnapshot(UUID versionId, UUID userId) {
        CanvasVersion v = versionRepository.findById(versionId).orElseThrow();
        Canvas canvas = canvasRepository.findById(v.getCanvasId()).orElseThrow();
        canvasService.checkReadPermission(canvas, userId);
        return v.getSnapshot();
    }

    @Transactional
    public VersionDto restoreVersion(UUID canvasId, UUID versionId, UUID userId) {
        canvasService.checkEditPermission(canvasId, userId);
        CanvasVersion sourceVersion = versionRepository.findById(versionId).orElseThrow();
        Map<String, Object> snapshot = sourceVersion.getSnapshot();

        connectionRepository.deleteByCanvasId(canvasId);
        elementRepository.deleteByCanvasId(canvasId);

        if (snapshot != null) {
            Object elementsObj = snapshot.get("elements");
            if (elementsObj instanceof List<?> list) {
                List<CanvasElementDto> elementDtos = objectMapper.convertValue(
                        list, new TypeReference<List<CanvasElementDto>>() {});
                int z = 1;
                for (CanvasElementDto dto : elementDtos) {
                    Map<String, Object> vv = new HashMap<>();
                    vv.put(userId.toString(), System.currentTimeMillis());

                    CanvasElement el = CanvasElement.builder()
                            .canvasId(canvasId)
                            .parentId(dto.getParentId())
                            .type(dto.getType())
                            .x(dto.getX() != null ? dto.getX() : 0.0)
                            .y(dto.getY() != null ? dto.getY() : 0.0)
                            .width(dto.getWidth() != null ? dto.getWidth() : 100.0)
                            .height(dto.getHeight() != null ? dto.getHeight() : 100.0)
                            .rotation(dto.getRotation() != null ? dto.getRotation() : 0.0)
                            .zIndex(dto.getZIndex() != null ? dto.getZIndex() : z++)
                            .opacity(dto.getOpacity() != null ? dto.getOpacity() : 1.0)
                            .locked(dto.getLocked() != null ? dto.getLocked() : false)
                            .visible(dto.getVisible() != null ? dto.getVisible() : true)
                            .groupId(dto.getGroupId())
                            .data(dto.getData() != null ? dto.getData() : new HashMap<>())
                            .versionVector(vv)
                            .lastModifiedBy(userId)
                            .lastModifiedAt(OffsetDateTime.now())
                            .build();
                    elementRepository.save(el);
                }
            }

            Object connectionsObj = snapshot.get("connections");
            if (connectionsObj instanceof List<?> list) {
                List<CanvasConnectionDto> connDtos = objectMapper.convertValue(
                        list, new TypeReference<List<CanvasConnectionDto>>() {});
                for (CanvasConnectionDto dto : connDtos) {
                    Map<String, Object> vv = new HashMap<>();
                    vv.put(userId.toString(), System.currentTimeMillis());

                    CanvasConnection conn = CanvasConnection.builder()
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
                            .zIndex(dto.getZIndex() != null ? dto.getZIndex() : 0)
                            .versionVector(vv)
                            .build();
                    connectionRepository.save(conn);
                }
            }
        }

        VersionDto newVersion = createVersion(canvasId, userId,
                "Restore from v" + sourceVersion.getVersionNumber());

        Map<String, Object> resetPayload = new HashMap<>();
        resetPayload.put("snapshot", canvasService.serializeCanvasData(canvasId));
        Map<String, Object> resetMsg = new HashMap<>();
        resetMsg.put("opId", UUID.randomUUID().toString());
        resetMsg.put("type", "RESET_CANVAS");
        resetMsg.put("timestamp", System.currentTimeMillis());
        resetMsg.put("userId", userId);
        resetMsg.put("payload", resetPayload);

        messagingTemplate.convertAndSend("/topic/canvas/" + canvasId + "/operations", resetMsg);
        try {
            redisTemplate.convertAndSend("collab:canvas:" + canvasId + ":ops", resetMsg);
        } catch (Exception ignored) {}

        return newVersion;
    }

    @Transactional
    public VersionDto createBranch(UUID canvasId, UUID fromVersionId, String branchName, UUID userId) {
        canvasService.checkEditPermission(canvasId, userId);
        CanvasVersion fromVersion = versionRepository.findById(fromVersionId).orElseThrow();

        Integer maxVn = versionRepository.findMaxVersionNumber(canvasId, branchName);
        int versionNumber = (maxVn != null ? maxVn : 0) + 1;

        CanvasVersion branchVersion = CanvasVersion.builder()
                .canvasId(canvasId)
                .versionNumber(versionNumber)
                .branchName(branchName)
                .parentVersionId(fromVersionId)
                .createdBy(userId)
                .summary("Branch '" + branchName + "' from v" + fromVersion.getVersionNumber())
                .snapshot(fromVersion.getSnapshot())
                .operations(new ArrayList<>())
                .build();

        branchVersion = versionRepository.save(branchVersion);
        return toDto(branchVersion);
    }

    @Transactional
    public void autoSaveIfNeeded(UUID canvasId, UUID userId) {
        long now = System.currentTimeMillis();
        Long last = lastAutoSave.get(canvasId);
        if (last != null && (now - last) < autoSaveInterval) {
            return;
        }
        lastAutoSave.put(canvasId, now);

        try {
            Integer maxVn = versionRepository.findMaxVersionNumber(canvasId, "main");
            int versionNumber = (maxVn != null ? maxVn : 0) + 1;

            Map<String, Object> snapshot = canvasService.serializeCanvasData(canvasId);

            CanvasVersion version = CanvasVersion.builder()
                    .canvasId(canvasId)
                    .versionNumber(versionNumber)
                    .branchName("main")
                    .createdBy(userId)
                    .summary("Auto-save v" + versionNumber)
                    .snapshot(snapshot)
                    .operations(new ArrayList<>())
                    .build();

            versionRepository.save(version);
        } catch (Exception ignored) {
        }
    }

    private VersionDto toDto(CanvasVersion v) {
        return VersionDto.builder()
                .id(v.getId())
                .canvasId(v.getCanvasId())
                .versionNumber(v.getVersionNumber())
                .branchName(v.getBranchName())
                .parentVersionId(v.getParentVersionId())
                .createdBy(v.getCreatedBy())
                .summary(v.getSummary())
                .operations(v.getOperations())
                .createdAt(v.getCreatedAt())
                .build();
    }
}
