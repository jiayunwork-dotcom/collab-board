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
@Table(name = "comments")
public class Comment {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "canvas_id", nullable = false)
    private UUID canvasId;

    @Builder.Default
    @Column(name = "anchor_x", nullable = false)
    private Double anchorX = 0.0;

    @Builder.Default
    @Column(name = "anchor_y", nullable = false)
    private Double anchorY = 0.0;

    @Column(name = "attached_element_id")
    private UUID attachedElementId;

    @Column(name = "created_by", nullable = false)
    private UUID createdBy;

    @Builder.Default
    @Column(name = "created_at")
    private OffsetDateTime createdAt = OffsetDateTime.now();
}
