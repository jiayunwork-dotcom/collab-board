package com.collabboard.controller;

import com.collabboard.dto.PermissionDto;
import com.collabboard.entity.CanvasPermission;
import com.collabboard.service.PermissionService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/canvases/{canvasId}/permissions")
public class PermissionController {

    private final PermissionService permissionService;

    public PermissionController(PermissionService permissionService) {
        this.permissionService = permissionService;
    }

    @GetMapping
    public ResponseEntity<List<PermissionDto>> getPermissions(Authentication authentication,
                                                               @PathVariable UUID canvasId) {
        UUID userId = (UUID) authentication.getPrincipal();
        return ResponseEntity.ok(permissionService.getCanvasPermissions(canvasId, userId));
    }

    @PostMapping
    public ResponseEntity<PermissionDto> addPermission(Authentication authentication,
                                                       @PathVariable UUID canvasId,
                                                       @RequestBody PermissionDto dto) {
        UUID userId = (UUID) authentication.getPrincipal();
        return ResponseEntity.ok(permissionService.addPermission(canvasId, userId, dto));
    }

    @PutMapping("/{permId}/role")
    public ResponseEntity<PermissionDto> updateRole(Authentication authentication,
                                                    @PathVariable UUID canvasId,
                                                    @PathVariable UUID permId,
                                                    @RequestBody Map<String, String> body) {
        UUID userId = (UUID) authentication.getPrincipal();
        CanvasPermission.Role role = CanvasPermission.Role.valueOf(body.get("role"));
        return ResponseEntity.ok(permissionService.updatePermissionRole(canvasId, permId, userId, role));
    }

    @DeleteMapping("/{permId}")
    public ResponseEntity<Void> removePermission(Authentication authentication,
                                                 @PathVariable UUID canvasId,
                                                 @PathVariable UUID permId) {
        UUID userId = (UUID) authentication.getPrincipal();
        permissionService.removePermission(canvasId, permId, userId);
        return ResponseEntity.noContent().build();
    }
}

@RestController
@RequestMapping("/invitations")
class InvitationController {

    private final PermissionService permissionService;

    public InvitationController(PermissionService permissionService) {
        this.permissionService = permissionService;
    }

    @PostMapping("/accept/{token}")
    public ResponseEntity<PermissionDto> acceptInvite(Authentication authentication,
                                                      @PathVariable String token) {
        UUID userId = (UUID) authentication.getPrincipal();
        return ResponseEntity.ok(permissionService.acceptInvite(token, userId));
    }
}
