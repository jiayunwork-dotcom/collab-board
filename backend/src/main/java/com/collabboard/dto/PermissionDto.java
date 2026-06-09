package com.collabboard.dto;

import com.collabboard.entity.CanvasPermission;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PermissionDto {
    private UUID id;
    private UUID canvasId;
    private UUID userId;
    private String username;
    private String userAvatar;
    private CanvasPermission.Role role;
    private String inviteEmail;
    private String inviteToken;
    private OffsetDateTime inviteExpiresAt;
    private OffsetDateTime createdAt;
}
