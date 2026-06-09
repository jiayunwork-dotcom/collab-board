package com.collabboard.controller;

import com.collabboard.dto.CanvasDto;
import com.collabboard.dto.FullCanvasDto;
import com.collabboard.service.CanvasService;
import com.collabboard.service.VersionService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/canvases")
public class CanvasController {

    private final CanvasService canvasService;
    private final VersionService versionService;

    public CanvasController(CanvasService canvasService, VersionService versionService) {
        this.canvasService = canvasService;
        this.versionService = versionService;
    }

    @PostMapping
    public ResponseEntity<CanvasDto> createCanvas(Authentication authentication,
                                                  @RequestBody CanvasDto dto) {
        UUID userId = (UUID) authentication.getPrincipal();
        return ResponseEntity.ok(canvasService.createCanvas(userId, dto));
    }

    @GetMapping
    public ResponseEntity<List<CanvasDto>> getUserCanvases(Authentication authentication) {
        UUID userId = (UUID) authentication.getPrincipal();
        return ResponseEntity.ok(canvasService.getUserCanvases(userId));
    }

    @GetMapping("/public")
    public ResponseEntity<List<CanvasDto>> getPublicCanvases() {
        return ResponseEntity.ok(canvasService.getPublicCanvases());
    }

    @GetMapping("/{id}")
    public ResponseEntity<FullCanvasDto> getCanvas(Authentication authentication,
                                                   @PathVariable UUID id) {
        UUID userId = authentication != null ? (UUID) authentication.getPrincipal() : null;
        return ResponseEntity.ok(canvasService.getFullCanvas(id, userId));
    }

    @GetMapping("/{id}/public")
    public ResponseEntity<FullCanvasDto> getPublicCanvas(@PathVariable UUID id) {
        return ResponseEntity.ok(canvasService.getFullCanvas(id, null));
    }

    @PutMapping("/{id}")
    public ResponseEntity<CanvasDto> updateCanvas(Authentication authentication,
                                                  @PathVariable UUID id,
                                                  @RequestBody CanvasDto dto) {
        UUID userId = (UUID) authentication.getPrincipal();
        return ResponseEntity.ok(canvasService.updateCanvas(id, userId, dto));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteCanvas(Authentication authentication,
                                             @PathVariable UUID id) {
        UUID userId = (UUID) authentication.getPrincipal();
        canvasService.deleteCanvas(id, userId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{id}/role")
    public ResponseEntity<Map<String, Object>> getUserRole(Authentication authentication,
                                                           @PathVariable UUID id) {
        UUID userId = authentication != null ? (UUID) authentication.getPrincipal() : null;
        var role = canvasService.getUserRole(id, userId);
        return ResponseEntity.ok(Map.of(
                "role", role != null ? role.name() : "PUBLIC",
                "userId", userId != null ? userId : ""
        ));
    }

    @PostMapping("/{id}/autosave")
    public ResponseEntity<Void> triggerAutoSave(Authentication authentication,
                                                @PathVariable UUID id) {
        UUID userId = (UUID) authentication.getPrincipal();
        versionService.autoSaveIfNeeded(id, userId);
        return ResponseEntity.ok().build();
    }
}
