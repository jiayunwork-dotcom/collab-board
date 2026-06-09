package com.collabboard.collaboration;

import com.collabboard.dto.CanvasConnectionDto;
import com.collabboard.dto.CanvasElementDto;
import com.collabboard.service.CanvasElementService;
import com.collabboard.service.CanvasService;
import com.collabboard.service.VersionService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import java.util.*;
import java.util.concurrent.TimeUnit;

@Slf4j
@Controller
public class CollaborationController {

    private static final String OP_CHANNEL = "collab:canvas:{canvasId}:ops";
    private static final String LAST_OPS_KEY = "collab:canvas:{canvasId}:lastOps";

    private final SimpMessagingTemplate messagingTemplate;
    private final CanvasElementService elementService;
    private final CanvasService canvasService;
    private final OnlineUserService onlineUserService;
    private final VersionService versionService;
    private final RedisTemplate<String, Object> redisTemplate;
    private final ObjectMapper objectMapper;

    public CollaborationController(SimpMessagingTemplate messagingTemplate,
                                   CanvasElementService elementService,
                                   CanvasService canvasService,
                                   OnlineUserService onlineUserService,
                                   VersionService versionService,
                                   RedisTemplate<String, Object> redisTemplate,
                                   ObjectMapper objectMapper) {
        this.messagingTemplate = messagingTemplate;
        this.elementService = elementService;
        this.canvasService = canvasService;
        this.onlineUserService = onlineUserService;
        this.versionService = versionService;
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CollabMessage {
        private String opId;
        private String type;
        private UUID userId;
        private long timestamp;
        private Map<String, Object> payload;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class OpAck {
        private String opId;
        private boolean success;
        private String error;
        private Object result;
    }

    @MessageMapping("/canvas/{canvasId}/op")
    public void handleOperation(@DestinationVariable UUID canvasId,
                                @Payload CollabMessage message,
                                @Header("simpUser") Object principalObj) {
        UUID userId = extractUserId(principalObj);
        if (userId == null) return;
        message.setUserId(userId);
        if (message.getTimestamp() == 0) message.setTimestamp(System.currentTimeMillis());
        if (message.getOpId() == null) message.setOpId(UUID.randomUUID().toString());

        try {
            Object result = processOperation(canvasId, userId, message);
            broadcastOperation(canvasId, message);
            cacheLastOperation(canvasId, message);

            OpAck ack = OpAck.builder()
                    .opId(message.getOpId())
                    .success(true)
                    .result(result)
                    .build();
            messagingTemplate.convertAndSendToUser(
                    userId.toString(), "/queue/canvas/" + canvasId + "/ack", ack);
        } catch (Exception e) {
            log.error("Operation failed: canvas={}, type={}", canvasId, message.getType(), e);
            OpAck ack = OpAck.builder()
                    .opId(message.getOpId())
                    .success(false)
                    .error(e.getMessage())
                    .build();
            messagingTemplate.convertAndSendToUser(
                    userId.toString(), "/queue/canvas/" + canvasId + "/ack", ack);
        }
    }

    @MessageMapping("/canvas/{canvasId}/cursor")
    public void handleCursor(@DestinationVariable UUID canvasId,
                             @Payload Map<String, Object> payload,
                             @Header("simpUser") Object principalObj) {
        UUID userId = extractUserId(principalObj);
        if (userId == null) return;
        double x = payload.get("x") instanceof Number n ? n.doubleValue() : 0;
        double y = payload.get("y") instanceof Number n ? n.doubleValue() : 0;
        onlineUserService.updateCursor(canvasId, userId, x, y);
    }

    @MessageMapping("/canvas/{canvasId}/selection")
    public void handleSelection(@DestinationVariable UUID canvasId,
                                @Payload Map<String, Object> payload,
                                @Header("simpUser") Object principalObj) {
        UUID userId = extractUserId(principalObj);
        if (userId == null) return;
        Object sel = payload.get("selection");
        List<UUID> selection = new ArrayList<>();
        if (sel instanceof List<?> list) {
            for (Object o : list) {
                try {
                    selection.add(UUID.fromString(o.toString()));
                } catch (Exception ignored) {
                }
            }
        }
        onlineUserService.updateSelection(canvasId, userId, selection);
    }

    @MessageMapping("/canvas/{canvasId}/viewport")
    public void handleViewport(@DestinationVariable UUID canvasId,
                               @Payload Map<String, Object> payload,
                               @Header("simpUser") Object principalObj) {
        UUID userId = extractUserId(principalObj);
        if (userId == null) return;
        try {
            Map<String, Object> viewport = new HashMap<>();
            viewport.put("userId", userId);
            viewport.put("x", payload.get("x"));
            viewport.put("y", payload.get("y"));
            viewport.put("zoom", payload.get("zoom"));
            viewport.put("timestamp", System.currentTimeMillis());
            messagingTemplate.convertAndSend("/topic/canvas/" + canvasId + "/viewports", viewport);
        } catch (Exception ignored) {
        }
    }

    @MessageMapping("/canvas/{canvasId}/ping")
    public void handlePing(@DestinationVariable UUID canvasId,
                           @Header("simpUser") Object principalObj) {
        UUID userId = extractUserId(principalObj);
        if (userId == null) return;
        messagingTemplate.convertAndSendToUser(
                userId.toString(), "/queue/canvas/" + canvasId + "/pong",
                Map.of("timestamp", System.currentTimeMillis()));
    }

    @SuppressWarnings("unchecked")
    private Object processOperation(UUID canvasId, UUID userId, CollabMessage msg) {
        String type = msg.getType();
        Map<String, Object> payload = msg.getPayload();

        return switch (type) {
            case "CREATE_ELEMENT" -> {
                CanvasElementDto dto = objectMapper.convertValue(payload, CanvasElementDto.class);
                yield elementService.createElement(canvasId, userId, dto);
            }
            case "BATCH_CREATE_ELEMENTS" -> {
                List<CanvasElementDto> dtos = ((List<?>) payload.get("elements")).stream()
                        .map(o -> objectMapper.convertValue(o, CanvasElementDto.class))
                        .toList();
                yield elementService.batchCreateElements(canvasId, userId, dtos);
            }
            case "UPDATE_ELEMENT" -> {
                CanvasElementDto dto = objectMapper.convertValue(payload, CanvasElementDto.class);
                yield elementService.updateElement(canvasId, dto.getId(), userId, dto);
            }
            case "DELETE_ELEMENT" -> {
                UUID elementId = UUID.fromString(payload.get("id").toString());
                elementService.deleteElement(canvasId, elementId, userId);
                yield Map.of("id", elementId);
            }
            case "BATCH_DELETE_ELEMENTS" -> {
                List<UUID> ids = ((List<?>) payload.get("ids")).stream()
                        .map(o -> UUID.fromString(o.toString()))
                        .toList();
                elementService.batchDeleteElements(canvasId, ids, userId);
                yield Map.of("ids", ids);
            }
            case "CREATE_CONNECTION" -> {
                CanvasConnectionDto dto = objectMapper.convertValue(payload, CanvasConnectionDto.class);
                yield elementService.createConnection(canvasId, userId, dto);
            }
            case "UPDATE_CONNECTION" -> {
                CanvasConnectionDto dto = objectMapper.convertValue(payload, CanvasConnectionDto.class);
                yield elementService.updateConnection(canvasId, dto.getId(), userId, dto);
            }
            case "DELETE_CONNECTION" -> {
                UUID connId = UUID.fromString(payload.get("id").toString());
                elementService.deleteConnection(canvasId, connId, userId);
                yield Map.of("id", connId);
            }
            case "AUTO_SAVE" -> {
                versionService.autoSaveIfNeeded(canvasId, userId);
                yield Map.of("saved", true);
            }
            case "CHAT_MESSAGE" -> {
                Map<String, Object> chatMsg = new HashMap<>();
                chatMsg.put("userId", userId);
                chatMsg.put("text", payload.get("text"));
                chatMsg.put("timestamp", System.currentTimeMillis());
                messagingTemplate.convertAndSend("/topic/canvas/" + canvasId + "/chat", chatMsg);
                yield chatMsg;
            }
            default -> throw new RuntimeException("Unknown operation type: " + type);
        };
    }

    private void broadcastOperation(UUID canvasId, CollabMessage message) {
        messagingTemplate.convertAndSend("/topic/canvas/" + canvasId + "/operations", message);
        String channel = OP_CHANNEL.replace("{canvasId}", canvasId.toString());
        try {
            redisTemplate.convertAndSend(channel, message);
        } catch (Exception e) {
            log.warn("Redis pub/sub failed", e);
        }
    }

    private void cacheLastOperation(UUID canvasId, CollabMessage message) {
        try {
            String key = LAST_OPS_KEY.replace("{canvasId}", canvasId.toString());
            redisTemplate.opsForList().rightPush(key, message);
            redisTemplate.opsForList().trim(key, -100, -1);
            redisTemplate.expire(key, 1, TimeUnit.HOURS);
        } catch (Exception ignored) {
        }
    }

    private UUID extractUserId(Object principalObj) {
        if (principalObj instanceof WebSocketPrincipal wsp) {
            return wsp.getUserId();
        }
        if (principalObj instanceof java.security.Principal p) {
            try {
                return UUID.fromString(p.getName());
            } catch (Exception ignored) {
            }
        }
        return null;
    }
}
