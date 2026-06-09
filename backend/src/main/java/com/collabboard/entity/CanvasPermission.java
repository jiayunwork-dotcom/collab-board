package com.collabboard.entity;

import jakarta.persistence.*;
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
@Entity
@Table(name = "canvas_permissions", uniqueConstraints = {
        @UniqueConstraint(columnNames = {"canvas_id", "user_id"}),
        @UniqueConstraint(columnNames = {"canvas_id", "invite_email"})
})
public class CanvasPermission {

    public enum Role {
        OWNER, EDITOR, COMMENTER, VIEWER
    }

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "canvas_id", nullable = false)
    private UUID canvasId;

    @Column(name = "user_id")
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Role role;

    @Column(name = "invite_email")
    private String inviteEmail;

    @Column(name = "invite_token", unique = true)
    private String inviteToken;

    @Column(name = "invite_expires_at")
    private OffsetDateTime inviteExpiresAt;

    @Builder.Default
    @Column(name = "created_at")
    private OffsetDateTime createdAt = OffsetDateTime.now();
}
