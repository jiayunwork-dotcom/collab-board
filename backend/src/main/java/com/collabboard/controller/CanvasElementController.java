package com.collabboard.controller;

import com.collabboard.dto.CanvasConnectionDto;
import com.collabboard.dto.CanvasElementDto;
import com.collabboard.service.CanvasElementService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/canvases/{canvasId}")
public class CanvasElementController {

    private final CanvasElementService elementService;

    public CanvasElementController(CanvasElementService elementService) {
        this.elementService = elementService;
    }

    @PostMapping("/elements")
    public ResponseEntity<CanvasElementDto> createElement(Authentication authentication,
                                                          @PathVariable UUID canvasId,
                                                          @RequestBody CanvasElementDto dto) {
        UUID userId = (UUID) authentication.getPrincipal();
        return ResponseEntity.ok(elementService.createElement(canvasId, userId, dto));
    }

    @PostMapping("/elements/batch")
    public ResponseEntity<List<CanvasElementDto>> batchCreateElements(Authentication authentication,
                                                                      @PathVariable UUID canvasId,
                                                                      @RequestBody List<CanvasElementDto> dtos) {
        UUID userId = (UUID) authentication.getPrincipal();
        return ResponseEntity.ok(elementService.batchCreateElements(canvasId, userId, dtos));
    }

    @PutMapping("/elements/{elementId}")
    public ResponseEntity<CanvasElementDto> updateElement(Authentication authentication,
                                                          @PathVariable UUID canvasId,
                                                          @PathVariable UUID elementId,
                                                          @RequestBody CanvasElementDto dto) {
        UUID userId = (UUID) authentication.getPrincipal();
        return ResponseEntity.ok(elementService.updateElement(canvasId, elementId, userId, dto));
    }

    @DeleteMapping("/elements/{elementId}")
    public ResponseEntity<Void> deleteElement(Authentication authentication,
                                              @PathVariable UUID canvasId,
                                              @PathVariable UUID elementId) {
        UUID userId = (UUID) authentication.getPrincipal();
        elementService.deleteElement(canvasId, elementId, userId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/elements/batch-delete")
    public ResponseEntity<Void> batchDeleteElements(Authentication authentication,
                                                    @PathVariable UUID canvasId,
                                                    @RequestBody Map<String, List<UUID>> body) {
        UUID userId = (UUID) authentication.getPrincipal();
        List<UUID> ids = body.get("ids");
        elementService.batchDeleteElements(canvasId, ids, userId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/connections")
    public ResponseEntity<CanvasConnectionDto> createConnection(Authentication authentication,
                                                                @PathVariable UUID canvasId,
                                                                @RequestBody CanvasConnectionDto dto) {
        UUID userId = (UUID) authentication.getPrincipal();
        return ResponseEntity.ok(elementService.createConnection(canvasId, userId, dto));
    }

    @PutMapping("/connections/{connId}")
    public ResponseEntity<CanvasConnectionDto> updateConnection(Authentication authentication,
                                                                @PathVariable UUID canvasId,
                                                                @PathVariable UUID connId,
                                                                @RequestBody CanvasConnectionDto dto) {
        UUID userId = (UUID) authentication.getPrincipal();
        return ResponseEntity.ok(elementService.updateConnection(canvasId, connId, userId, dto));
    }

    @DeleteMapping("/connections/{connId}")
    public ResponseEntity<Void> deleteConnection(Authentication authentication,
                                                 @PathVariable UUID canvasId,
                                                 @PathVariable UUID connId) {
        UUID userId = (UUID) authentication.getPrincipal();
        elementService.deleteConnection(canvasId, connId, userId);
        return ResponseEntity.noContent().build();
    }
}
