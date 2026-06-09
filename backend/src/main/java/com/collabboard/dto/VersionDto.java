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
public class VersionDto {
    private UUID id;
    private UUID canvasId;
    private Integer versionNumber;
    private String branchName;
    private UUID parentVersionId;
    private UUID createdBy;
    private String createdByName;
    private String summary;
    private List<Map<String, Object>> operations;
    private OffsetDateTime createdAt;
}
