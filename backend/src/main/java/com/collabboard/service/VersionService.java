package com.collabboard.service;

import com.collabboard.dto.VersionDto;
import com.collabboard.entity.Canvas;
import com.collabboard.entity.CanvasVersion;
import com.collabboard.repository.CanvasRepository;
import com.collabboard.repository.CanvasVersionRepository;
import com.collabboard.repository.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Service
public class VersionService {

    private final CanvasVersionRepository versionRepository;
    private final CanvasRepository canvasRepository;
    private final UserRepository userRepository;
    private final CanvasService canvasService;

    @Value("${app.version.auto-save-interval:30000}")
    private long autoSaveInterval;

    private final Map<UUID, Long> lastAutoSave = new ConcurrentHashMap<>();

    public VersionService(CanvasVersionRepository versionRepository,
                          CanvasRepository canvasRepository,
                          UserRepository userRepository,
                          CanvasService canvasService) {
        this.versionRepository = versionRepository;
        this.canvasRepository = canvasRepository;
        this.userRepository = userRepository;
        this.canvasService = canvasService;
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

        VersionDto newVersion = createVersion(canvasId, userId,
                "Restore from v" + sourceVersion.getVersionNumber());

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
