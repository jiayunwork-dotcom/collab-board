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
public class FullCanvasDto {
    private CanvasDto canvas;
    private List<CanvasElementDto> elements;
    private List<CanvasConnectionDto> connections;
    private Map<String, Object> viewport;
}
