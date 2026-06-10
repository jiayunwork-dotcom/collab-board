package com.collabboard.repository;

import com.collabboard.entity.PluginConfig;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface PluginConfigRepository extends JpaRepository<PluginConfig, UUID> {

    List<PluginConfig> findByCanvasIdAndPluginName(UUID canvasId, String pluginName);

    Optional<PluginConfig> findByCanvasIdAndPluginNameAndConfigKey(UUID canvasId, String pluginName, String configKey);

    void deleteByCanvasIdAndPluginName(UUID canvasId, String pluginName);
}
