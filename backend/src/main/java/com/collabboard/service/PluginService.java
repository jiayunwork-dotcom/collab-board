package com.collabboard.service;

import com.collabboard.dto.PluginInstallationDto;
import com.collabboard.entity.PluginInstallation;
import com.collabboard.entity.User;
import com.collabboard.repository.PluginInstallationRepository;
import com.collabboard.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Service
public class PluginService {

    private static final Set<String> VALID_PERMISSIONS = Set.of(
            "canvas:read", "canvas:write", "user:info",
            "notification:send", "storage:local"
    );

    private final PluginInstallationRepository pluginRepository;
    private final UserRepository userRepository;
    private final CanvasService canvasService;

    public PluginService(PluginInstallationRepository pluginRepository,
                         UserRepository userRepository,
                         CanvasService canvasService) {
        this.pluginRepository = pluginRepository;
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
