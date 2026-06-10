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
public class CommentDto {
    private UUID id;
    private UUID canvasId;
    private Double anchorX;
    private Double anchorY;
    private UUID attachedElementId;
    private UUID createdBy;
    private String createdByName;
    private String createdByAvatar;
    private String createdByColor;
    private OffsetDateTime createdAt;
    private Integer replyCount;
}
