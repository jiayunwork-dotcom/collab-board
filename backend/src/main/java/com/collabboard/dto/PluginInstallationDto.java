package com.collabboard.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PluginInstallationDto {

    private UUID id;
    private UUID canvasId;

    @NotBlank(message = "Plugin name is required")
    @Size(max = 100, message = "Plugin name must be at most 100 characters")
    private String pluginName;

    @NotBlank(message = "Plugin version is required")
    @Size(max = 50, message = "Plugin version must be at most 50 characters")
    private String pluginVersion;

    @NotEmpty(message = "Permissions are required")
    private List<String> permissions;

    private Boolean enabled;
    private UUID installedBy;
    private String installedByName;
    private OffsetDateTime installedAt;
}
