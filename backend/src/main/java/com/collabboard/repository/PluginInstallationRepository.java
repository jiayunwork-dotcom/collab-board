package com.collabboard.repository;

import com.collabboard.entity.PluginInstallation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface PluginInstallationRepository extends JpaRepository<PluginInstallation, UUID> {

    List<PluginInstallation> findByCanvasId(UUID canvasId);

    Optional<PluginInstallation> findByCanvasIdAndPluginName(UUID canvasId, String pluginName);

    void deleteByCanvasIdAndPluginName(UUID canvasId, String pluginName);

    boolean existsByCanvasIdAndPluginName(UUID canvasId, String pluginName);
}
