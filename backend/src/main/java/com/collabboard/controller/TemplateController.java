package com.collabboard.controller;

import com.collabboard.entity.Template;
import com.collabboard.service.CanvasService;
import com.collabboard.service.TemplateService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.*;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/templates")
public class TemplateController {

    private final TemplateService templateService;
    private final CanvasService canvasService;
    private final ObjectMapper objectMapper;

    public TemplateController(TemplateService templateService,
                              CanvasService canvasService,
                              ObjectMapper objectMapper) {
        this.templateService = templateService;
        this.canvasService = canvasService;
        this.objectMapper = objectMapper;
    }

    @GetMapping("/public")
    public ResponseEntity<List<Template>> getPublicTemplates() {
        return ResponseEntity.ok(templateService.getPublicTemplates());
    }

    @GetMapping
    public ResponseEntity<List<Template>> getAllTemplates(Authentication authentication) {
        UUID userId = authentication != null ? (UUID) authentication.getPrincipal() : null;
        return ResponseEntity.ok(templateService.getAllTemplates(userId));
    }

    @GetMapping("/{id}")
    public ResponseEntity<Template> getTemplate(@PathVariable UUID id) {
        return ResponseEntity.ok(templateService.getTemplate(id));
    }

    @PostMapping
    public ResponseEntity<Template> createFromCanvas(Authentication authentication,
                                                     @RequestBody Map<String, Object> body) {
        UUID userId = (UUID) authentication.getPrincipal();
        UUID canvasId = UUID.fromString((String) body.get("canvasId"));
        String name = (String) body.getOrDefault("name", "My Template");
        String description = (String) body.getOrDefault("description", "");
        String category = (String) body.getOrDefault("category", "custom");

        canvasService.checkEditPermission(canvasId, userId);
        Map<String, Object> data = canvasService.serializeCanvasData(canvasId);

        return ResponseEntity.ok(templateService.createCustomTemplate(
                userId, name, description, category, data));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteTemplate(Authentication authentication,
                                               @PathVariable UUID id) {
        UUID userId = (UUID) authentication.getPrincipal();
        templateService.deleteTemplate(id, userId);
        return ResponseEntity.noContent().build();
    }
}

@RestController
@RequestMapping("/canvases/{canvasId}/export")
class ExportController {

    private final CanvasService canvasService;
    private final ObjectMapper objectMapper;

    public ExportController(CanvasService canvasService, ObjectMapper objectMapper) {
        this.canvasService = canvasService;
        this.objectMapper = objectMapper;
    }

    @GetMapping("/json")
    public ResponseEntity<byte[]> exportJson(Authentication authentication,
                                             @PathVariable UUID canvasId) {
        UUID userId = authentication != null ? (UUID) authentication.getPrincipal() : null;
        var full = canvasService.getFullCanvas(canvasId, userId);

        Map<String, Object> export = new HashMap<>();
        export.put("canvas", full.getCanvas());
        export.put("elements", full.getElements());
        export.put("connections", full.getConnections());
        export.put("viewport", full.getViewport());
        export.put("exportedAt", System.currentTimeMillis());
        export.put("version", "1.0");

        try {
            byte[] json = objectMapper.writerWithDefaultPrettyPrinter()
                    .writeValueAsBytes(export);
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setContentDisposition(ContentDisposition.attachment()
                    .filename("canvas-" + canvasId + ".json", StandardCharsets.UTF_8)
                    .build());
            return new ResponseEntity<>(json, headers, HttpStatus.OK);
        } catch (Exception e) {
            throw new RuntimeException("Export failed", e);
        }
    }
}
