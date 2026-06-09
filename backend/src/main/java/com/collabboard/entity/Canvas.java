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
@Table(name = "canvases")
public class Canvas {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "owner_id", nullable = false)
    private UUID ownerId;

    @Builder.Default
    @Column(nullable = false)
    private String title = "Untitled";

    private String description;

    @Column(name = "thumbnail_url")
    private String thumbnailUrl;

    @Builder.Default
    @Column(name = "is_public")
    private Boolean isPublic = false;

    @Builder.Default
    @Column(name = "background_type", length = 20)
    private String backgroundType = "GRID_DOTS";

    @Builder.Default
    @Column(name = "background_color", length = 20)
    private String backgroundColor = "#FFFFFF";

    @Builder.Default
    @Column(name = "grid_size")
    private Integer gridSize = 20;

    @Builder.Default
    @Column(name = "viewport_x")
    private Double viewportX = 0.0;

    @Builder.Default
    @Column(name = "viewport_y")
    private Double viewportY = 0.0;

    @Builder.Default
    @Column(name = "viewport_zoom")
    private Double viewportZoom = 1.0;

    @Builder.Default
    @Column(name = "created_at")
    private OffsetDateTime createdAt = OffsetDateTime.now();

    @Builder.Default
    @Column(name = "updated_at")
    private OffsetDateTime updatedAt = OffsetDateTime.now();

    @PreUpdate
    protected void onUpdate() {
        updatedAt = OffsetDateTime.now();
    }
}
