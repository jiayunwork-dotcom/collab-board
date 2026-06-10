package com.collabboard.service;

import com.collabboard.dto.PluginConfigDto;
import com.collabboard.dto.PluginInstallationDto;
import com.collabboard.entity.PluginConfig;
import com.collabboard.entity.PluginInstallation;
import com.collabboard.entity.User;
import com.collabboard.repository.PluginConfigRepository;
import com.collabboard.repository.PluginInstallationRepository;
import com.collabboard.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class PluginService {

    private static final Set<String> VALID_PERMISSIONS = Set.of(
            "canvas:read", "canvas:write", "user:info",
            "notification:send", "storage:local"
    );

    private final PluginInstallationRepository pluginRepository;
    private final PluginConfigRepository pluginConfigRepository;
    private final UserRepository userRepository;
    private final CanvasService canvasService;

    public PluginService(PluginInstallationRepository pluginRepository,
                         PluginConfigRepository pluginConfigRepository,
                         UserRepository userRepository,
                         CanvasService canvasService) {
        this.pluginRepository = pluginRepository;
        this.pluginConfigRepository = pluginConfigRepository;
        this.userRepository = userRepository;
        this.canvasService = canvasService;
    }

    public List<PluginInstallationDto> getCanvasPlugins(UUID canvasId, UUID requesterId) {
        canvasService.checkViewPermission(canvasId, requesterId);
        List<PluginInstallation> installations = pluginRepository.findByCanvasId(canvasId);

        Set<UUID> userIds = installations.stream()
                .map(PluginInstallation::getInstalledBy)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());

        Map<UUID, User> userMap = new HashMap<>();
        if (!userIds.isEmpty()) {
            userMap = userRepository.findAllById(userIds).stream()
                    .collect(Collectors.toMap(User::getId, u -> u));
        }

        return installations.stream()
                .map(p -> toDto(p, userMap.get(p.getInstalledBy())))
                .toList();
    }

    @Transactional
    public PluginInstallationDto installPlugin(UUID canvasId, UUID requesterId, PluginInstallationDto dto) {
        canvasService.checkEditPermission(canvasId, requesterId);

        if (pluginRepository.existsByCanvasIdAndPluginName(canvasId, dto.getPluginName())) {
            throw new RuntimeException("Plugin already installed");
        }

        List<String> permissions = dto.getPermissions();
        if (permissions != null) {
            for (String perm : permissions) {
                if (!VALID_PERMISSIONS.contains(perm)) {
                    throw new RuntimeException("Invalid permission: " + perm);
                }
            }
        }

        PluginInstallation installation = PluginInstallation.builder()
                .canvasId(canvasId)
                .pluginName(dto.getPluginName())
                .pluginVersion(dto.getPluginVersion())
                .permissions(permissions != null ? permissions : new ArrayList<>())
                .enabled(true)
                .installedBy(requesterId)
                .build();

        installation = pluginRepository.save(installation);
        User user = userRepository.findById(requesterId).orElse(null);
        return toDto(installation, user);
    }

    @Transactional
    public PluginInstallationDto togglePlugin(UUID canvasId, String pluginName, UUID requesterId) {
        canvasService.checkEditPermission(canvasId, requesterId);

        PluginInstallation installation = pluginRepository
                .findByCanvasIdAndPluginName(canvasId, pluginName)
                .orElseThrow(() -> new RuntimeException("Plugin not found"));

        installation.setEnabled(!installation.getEnabled());
        installation = pluginRepository.save(installation);

        User user = userRepository.findById(installation.getInstalledBy()).orElse(null);
        return toDto(installation, user);
    }

    @Transactional
    public void uninstallPlugin(UUID canvasId, String pluginName, UUID requesterId) {
        canvasService.checkEditPermission(canvasId, requesterId);

        if (!pluginRepository.existsByCanvasIdAndPluginName(canvasId, pluginName)) {
            throw new RuntimeException("Plugin not found");
        }

        pluginRepository.deleteByCanvasIdAndPluginName(canvasId, pluginName);
    }

    public Set<String> getValidPermissions() {
        return VALID_PERMISSIONS;
    }

    public List<PluginConfigDto> getPluginConfig(UUID canvasId, String pluginName, UUID requesterId) {
        canvasService.checkViewPermission(canvasId, requesterId);
        List<PluginConfig> configs = pluginConfigRepository.findByCanvasIdAndPluginName(canvasId, pluginName);
        return configs.stream()
                .map(this::toConfigDto)
                .toList();
    }

    @Transactional
    public List<PluginConfigDto> updatePluginConfig(UUID canvasId, String pluginName, UUID requesterId, List<PluginConfigDto> configs) {
        canvasService.checkEditPermission(canvasId, requesterId);

        for (PluginConfigDto dto : configs) {
            Optional<PluginConfig> existing = pluginConfigRepository
                    .findByCanvasIdAndPluginNameAndConfigKey(canvasId, pluginName, dto.getConfigKey());

            if (existing.isPresent()) {
                PluginConfig config = existing.get();
                config.setConfigValue(dto.getConfigValue());
                config.setUpdatedAt(OffsetDateTime.now());
                pluginConfigRepository.save(config);
            } else {
                PluginConfig config = PluginConfig.builder()
                        .canvasId(canvasId)
                        .pluginName(pluginName)
                        .configKey(dto.getConfigKey())
                        .configValue(dto.getConfigValue())
                        .build();
                pluginConfigRepository.save(config);
            }
        }

        List<PluginConfig> updated = pluginConfigRepository.findByCanvasIdAndPluginName(canvasId, pluginName);
        return updated.stream()
                .map(this::toConfigDto)
                .toList();
    }

    private PluginConfigDto toConfigDto(PluginConfig c) {
        return PluginConfigDto.builder()
                .configKey(c.getConfigKey())
                .configValue(c.getConfigValue())
                .build();
    }

    private PluginInstallationDto toDto(PluginInstallation p, User user) {
        return PluginInstallationDto.builder()
                .id(p.getId())
                .canvasId(p.getCanvasId())
                .pluginName(p.getPluginName())
                .pluginVersion(p.getPluginVersion())
                .permissions(p.getPermissions())
                .enabled(p.getEnabled())
                .installedBy(p.getInstalledBy())
                .installedByName(user != null ? user.getUsername() : null)
                .installedAt(p.getInstalledAt())
                .build();
    }
}
