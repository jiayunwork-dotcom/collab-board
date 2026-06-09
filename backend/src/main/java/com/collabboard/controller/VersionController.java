package com.collabboard.controller;

import com.collabboard.dto.VersionDto;
import com.collabboard.service.VersionService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/canvases/{canvasId}/versions")
public class VersionController {

    private final VersionService versionService;

    public VersionController(VersionService versionService) {
        this.versionService = versionService;
    }

    @PostMapping
    public ResponseEntity<VersionDto> createVersion(Authentication authentication,
                                                    @PathVariable UUID canvasId,
                                                    @RequestBody(required = false) Map<String, String> body) {
        UUID userId = (UUID) authentication.getPrincipal();
        String summary = body != null ? body.get("summary") : null;
        return ResponseEntity.ok(versionService.createVersion(canvasId, userId, summary));
    }

    @GetMapping
    public ResponseEntity<List<VersionDto>> getVersions(Authentication authentication,
                                                        @PathVariable UUID canvasId,
                                                        @RequestParam(required = false) String branch) {
        UUID userId = authentication != null ? (UUID) authentication.getPrincipal() : null;
        return ResponseEntity.ok(versionService.getCanvasVersions(canvasId, branch, userId));
    }

    @GetMapping("/{versionId}")
    public ResponseEntity<VersionDto> getVersion(Authentication authentication,
                                                 @PathVariable UUID canvasId,
                                                 @PathVariable UUID versionId) {
        UUID userId = authentication != null ? (UUID) authentication.getPrincipal() : null;
        return ResponseEntity.ok(versionService.getVersion(versionId, userId));
    }

    @GetMapping("/{versionId}/snapshot")
    public ResponseEntity<Map<String, Object>> getSnapshot(Authentication authentication,
                                                           @PathVariable UUID canvasId,
                                                           @PathVariable UUID versionId) {
        UUID userId = authentication != null ? (UUID) authentication.getPrincipal() : null;
        return ResponseEntity.ok(versionService.getVersionSnapshot(versionId, userId));
    }

    @PostMapping("/{versionId}/restore")
    public ResponseEntity<VersionDto> restoreVersion(Authentication authentication,
                                                     @PathVariable UUID canvasId,
                                                     @PathVariable UUID versionId) {
        UUID userId = (UUID) authentication.getPrincipal();
        return ResponseEntity.ok(versionService.restoreVersion(canvasId, versionId, userId));
    }

    @PostMapping("/{versionId}/branch")
    public ResponseEntity<VersionDto> createBranch(Authentication authentication,
                                                   @PathVariable UUID canvasId,
                                                   @PathVariable UUID versionId,
                                                   @RequestBody Map<String, String> body) {
        UUID userId = (UUID) authentication.getPrincipal();
        String branchName = body.get("branchName");
        return ResponseEntity.ok(versionService.createBranch(canvasId, versionId, branchName, userId));
    }
}
