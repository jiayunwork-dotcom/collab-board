package com.collabboard.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "canvas_connections")
public class CanvasConnection {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "canvas_id", nullable = false)
    private UUID canvasId;

    @Column(name = "from_element_id", nullable = false)
    private UUID fromElementId;

    @Column(name = "to_element_id", nullable = false)
    private UUID toElementId;

    @Builder.Default
    @Column(name = "from_point", length = 20)
    private String fromPoint = "auto";

    @Builder.Default
    @Column(name = "to_point", length = 20)
    private String toPoint = "auto";

    @Builder.Default
    @Column(length = 20)
    private String style = "curve";

    @Builder.Default
    @Column(name = "arrow_style", length = 20)
    private String arrowStyle = "end";

    @Builder.Default
    @Column(length = 20)
    private String color = "#374151";

    @Builder.Default
    private Double thickness = 2.0;

    private String label;

    @Builder.Default
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private List<Map<String, Object>> waypoints = new ArrayList<>();

    @Builder.Default
    @Column(name = "z_index")
    private Integer zIndex = 0;

    @Builder.Default
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "version_vector", columnDefinition = "jsonb", nullable = false)
    private Map<String, Object> versionVector = new HashMap<>();

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
