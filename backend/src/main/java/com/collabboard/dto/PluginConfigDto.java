package com.collabboard.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PluginConfigDto {

    @NotBlank(message = "Config key is required")
    private String configKey;

    private String configValue;
}
