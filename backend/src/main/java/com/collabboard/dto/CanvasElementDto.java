package com.collabboard.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CanvasElementDto {
    private UUID id;
    private UUID canvasId;
    private UUID parentId;
    private String type;
    private Double x;
    private Double y;
    private Double width;
    private Double height;
    private Double rotation;
    private Integer zIndex;
    private Double opacity;
    private Boolean locked;
    private Boolean visible;
    private UUID groupId;
    private Map<String, Object> data;
    private Map<String, Object> versionVector;
    private UUID lastModifiedBy;
    private OffsetDateTime lastModifiedAt;
    private OffsetDateTime createdAt;
}
