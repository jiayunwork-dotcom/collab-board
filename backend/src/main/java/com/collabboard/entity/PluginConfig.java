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
@Table(name = "plugin_configs")
public class PluginConfig {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "canvas_id", nullable = false)
    private UUID canvasId;

    @Column(name = "plugin_name", nullable = false, length = 100)
    private String pluginName;

    @Column(name = "config_key", nullable = false, length = 100)
    private String configKey;

    @Column(name = "config_value")
    private String configValue;

    @Builder.Default
    @Column(name = "updated_at")
    private OffsetDateTime updatedAt = OffsetDateTime.now();
}
