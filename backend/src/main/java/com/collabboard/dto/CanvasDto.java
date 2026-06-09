package com.collabboard.dto;

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
public class CanvasDto {
    private UUID id;
    private UUID ownerId;
    private String title;
    private String description;
    private String thumbnailUrl;
    private Boolean isPublic;
    private String backgroundType;
    private String backgroundColor;
    private Integer gridSize;
    private Double viewportX;
    private Double viewportY;
    private Double viewportZoom;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;
}
