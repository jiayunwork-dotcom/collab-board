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
public class CanvasConnectionDto {
    private UUID id;
    private UUID canvasId;
    private UUID fromElementId;
    private UUID toElementId;
    private String fromPoint;
    private String toPoint;
    private String style;
    private String arrowStyle;
    private String color;
    private Double thickness;
    private String label;
    private List<Map<String, Object>> waypoints;
    private Integer zIndex;
    private Map<String, Object> versionVector;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;
}
