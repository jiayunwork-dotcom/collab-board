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
import java.util.List;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "plugin_installations")
public class PluginInstallation {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "canvas_id", nullable = false)
    private UUID canvasId;

    @Column(name = "plugin_name", nullable = false, length = 100)
    private String pluginName;

    @Column(name = "plugin_version", nullable = false, length = 50)
    private String pluginVersion;

    @Builder.Default
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false)
    private List<String> permissions = new ArrayList<>();

    @Builder.Default
    private Boolean enabled = true;

    @Column(name = "installed_by", nullable = false)
    private UUID installedBy;

    @Builder.Default
    @Column(name = "installed_at")
    private OffsetDateTime installedAt = OffsetDateTime.now();
}
