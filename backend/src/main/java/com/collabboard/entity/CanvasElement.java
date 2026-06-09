package com.collabboard.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "canvas_elements")
public class CanvasElement {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "canvas_id", nullable = false)
    private UUID canvasId;

    @Column(name = "parent_id")
    private UUID parentId;

    @Column(nullable = false, length = 30)
    private String type;

    @Builder.Default
    private Double x = 0.0;

    @Builder.Default
    private Double y = 0.0;

    @Builder.Default
    private Double width = 100.0;

    @Builder.Default
    private Double height = 100.0;

    @Builder.Default
    private Double rotation = 0.0;

    @Builder.Default
    @Column(name = "z_index")
    private Integer zIndex = 0;

    @Builder.Default
    private Double opacity = 1.0;

    @Builder.Default
    private Boolean locked = false;

    @Builder.Default
    private Boolean visible = true;

    @Column(name = "group_id")
    private UUID groupId;

    @Builder.Default
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb", nullable = false)
    private Map<String, Object> data = new HashMap<>();

    @Builder.Default
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "version_vector", columnDefinition = "jsonb", nullable = false)
    private Map<String, Object> versionVector = new HashMap<>();

    @Column(name = "last_modified_at")
    private OffsetDateTime lastModifiedAt;

    @Column(name = "last_modified_by")
    private UUID lastModifiedBy;

    @Builder.Default
    @Column(name = "created_at")
    private OffsetDateTime createdAt = OffsetDateTime.now();

    @PrePersist
    protected void onCreate() {
        if (lastModifiedAt == null) {
            lastModifiedAt = OffsetDateTime.now();
        }
    }
}
