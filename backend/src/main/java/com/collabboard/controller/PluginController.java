package com.collabboard.controller;

import com.collabboard.dto.PluginInstallationDto;
import com.collabboard.service.PluginService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/canvases/{canvasId}/plugins")
public class PluginController {

    private final PluginService pluginService;

    public PluginController(PluginService pluginService) {
        this.pluginService = pluginService;
    }

    @GetMapping
    public ResponseEntity<List<PluginInstallationDto>> listPlugins(
            Authentication authentication,
            @PathVariable UUID canvasId) {
        UUID userId = authentication != null ? (UUID) authentication.getPrincipal() : null;
        return ResponseEntity.ok(pluginService.getCanvasPlugins(canvasId, userId));
    }

    @PostMapping
    public ResponseEntity<PluginInstallationDto> installPlugin(
            Authentication authentication,
            @PathVariable UUID canvasId,
            @Valid @RequestBody PluginInstallationDto dto) {
        UUID userId = (UUID) authentication.getPrincipal();
        return ResponseEntity.ok(pluginService.installPlugin(canvasId, userId, dto));
    }

    @PutMapping("/{pluginName}/toggle")
    public ResponseEntity<PluginInstallationDto> togglePlugin(
            Authentication authentication,
            @PathVariable UUID canvasId,
            @PathVariable String pluginName) {
        UUID userId = (UUID) authentication.getPrincipal();
        return ResponseEntity.ok(pluginService.togglePlugin(canvasId, pluginName, userId));
    }

    @DeleteMapping("/{pluginName}")
    public ResponseEntity<Void> uninstallPlugin(
            Authentication authentication,
            @PathVariable UUID canvasId,
            @PathVariable String pluginName) {
        UUID userId = (UUID) authentication.getPrincipal();
        pluginService.uninstallPlugin(canvasId, pluginName, userId);
        return ResponseEntity.noContent().build();
    }
}
