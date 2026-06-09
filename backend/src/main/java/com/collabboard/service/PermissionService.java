package com.collabboard.service;

import com.collabboard.dto.PermissionDto;
import com.collabboard.entity.CanvasPermission;
import com.collabboard.entity.User;
import com.collabboard.repository.CanvasPermissionRepository;
import com.collabboard.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class PermissionService {

    private final CanvasPermissionRepository permissionRepository;
    private final UserRepository userRepository;
    private final CanvasService canvasService;
    private final SecureRandom random = new SecureRandom();

    public PermissionService(CanvasPermissionRepository permissionRepository,
                             UserRepository userRepository,
                             CanvasService canvasService) {
        this.permissionRepository = permissionRepository;
        this.userRepository = userRepository;
        this.canvasService = canvasService;
    }

    public List<PermissionDto> getCanvasPermissions(UUID canvasId, UUID requesterId) {
        canvasService.checkEditPermission(canvasId, requesterId);

        List<CanvasPermission> perms = permissionRepository.findByCanvasId(canvasId);
        Map<UUID, User> userMap = new HashMap<>();

        List<UUID> userIds = perms.stream()
                .map(CanvasPermission::getUserId)
                .filter(Objects::nonNull)
                .toList();
        if (!userIds.isEmpty()) {
            userMap = userRepository.findAllById(userIds).stream()
                    .collect(Collectors.toMap(User::getId, u -> u));
        }

        return perms.stream()
                .map(p -> toDto(p, userMap.get(p.getUserId())))
                .toList();
    }

    @Transactional
    public PermissionDto addPermission(UUID canvasId, UUID requesterId, PermissionDto dto) {
        canvasService.checkEditPermission(canvasId, requesterId);

        CanvasPermission permission = CanvasPermission.builder()
                .canvasId(canvasId)
                .userId(dto.getUserId())
                .role(dto.getRole())
                .inviteEmail(dto.getInviteEmail())
                .build();

        if (dto.getInviteEmail() != null && dto.getUserId() == null) {
            permission.setInviteToken(generateInviteToken());
            permission.setInviteExpiresAt(OffsetDateTime.now().plusDays(7));
        }

        permission = permissionRepository.save(permission);
        return toDto(permission, null);
    }

    @Transactional
    public PermissionDto updatePermissionRole(UUID canvasId, UUID permId, UUID requesterId,
                                              CanvasPermission.Role newRole) {
        canvasService.checkEditPermission(canvasId, requesterId);
        CanvasPermission perm = permissionRepository.findById(permId).orElseThrow();
        if (!perm.getCanvasId().equals(canvasId)) throw new RuntimeException("Invalid permission");
        perm.setRole(newRole);
        return toDto(permissionRepository.save(perm), null);
    }

    @Transactional
    public void removePermission(UUID canvasId, UUID permId, UUID requesterId) {
        canvasService.checkEditPermission(canvasId, requesterId);
        CanvasPermission perm = permissionRepository.findById(permId).orElseThrow();
        if (perm.getRole() == CanvasPermission.Role.OWNER) {
            throw new RuntimeException("Cannot remove owner permission");
        }
        permissionRepository.delete(perm);
    }

    @Transactional
    public PermissionDto acceptInvite(String inviteToken, UUID userId) {
        CanvasPermission perm = permissionRepository.findByInviteToken(inviteToken)
                .orElseThrow(() -> new RuntimeException("Invalid or expired invite"));

        if (perm.getInviteExpiresAt() != null && perm.getInviteExpiresAt().isBefore(OffsetDateTime.now())) {
            throw new RuntimeException("Invite expired");
        }

        perm.setUserId(userId);
        perm.setInviteToken(null);
        perm.setInviteEmail(null);
        perm.setInviteExpiresAt(null);
        perm = permissionRepository.save(perm);

        User user = userRepository.findById(userId).orElse(null);
        return toDto(perm, user);
    }

    private String generateInviteToken() {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }

    private PermissionDto toDto(CanvasPermission p, User user) {
        PermissionDto.PermissionDtoBuilder builder = PermissionDto.builder()
                .id(p.getId())
                .canvasId(p.getCanvasId())
                .userId(p.getUserId())
                .role(p.getRole())
                .inviteEmail(p.getInviteEmail())
                .inviteToken(p.getInviteToken())
                .inviteExpiresAt(p.getInviteExpiresAt())
                .createdAt(p.getCreatedAt());

        if (user != null) {
            builder.username(user.getUsername());
            builder.userAvatar(user.getAvatarUrl());
        }
        return builder.build();
    }
}
