package com.collabboard.collaboration;

import com.collabboard.dto.UserDto;
import com.collabboard.service.UserService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
public class OnlineUserService {

    private static final String ONLINE_USERS_KEY = "collab:canvas:{canvasId}:users";
    private static final String USER_SESSIONS_KEY = "collab:user:{userId}:sessions";
    private static final String USER_INFO_KEY = "collab:user:{userId}:info";

    private final RedisTemplate<String, Object> redisTemplate;
    private final SimpMessagingTemplate messagingTemplate;
    private final UserService userService;
    private final ObjectMapper objectMapper;

    private final Map<UUID, Set<UUID>> canvasOnlineUsers = new ConcurrentHashMap<>();

    public OnlineUserService(RedisTemplate<String, Object> redisTemplate,
                             SimpMessagingTemplate messagingTemplate,
                             UserService userService,
                             ObjectMapper objectMapper) {
        this.redisTemplate = redisTemplate;
        this.messagingTemplate = messagingTemplate;
        this.userService = userService;
        this.objectMapper = objectMapper;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class OnlineUserInfo {
        private UUID userId;
        private String username;
        private String avatarUrl;
        private String color;
        private double cursorX;
        private double cursorY;
        private UUID canvasId;
        private List<UUID> selection;
        private long lastActive;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class UserPresenceMessage {
        private String type;
        private OnlineUserInfo user;
        private List<OnlineUserInfo> allUsers;
    }

    public void userJoined(UUID canvasId, UUID userId, String sessionId) {
        String userKey = USER_INFO_KEY.replace("{userId}", userId.toString());
        String canvasKey = ONLINE_USERS_KEY.replace("{canvasId}", canvasId.toString());
        String sessionsKey = USER_SESSIONS_KEY.replace("{userId}", userId.toString());

        OnlineUserInfo info = (OnlineUserInfo) redisTemplate.opsForValue().get(userKey);
        if (info == null) {
            try {
                UserDto userDto = userService.getById(userId);
                info = OnlineUserInfo.builder()
                        .userId(userId)
                        .username(userDto.getUsername())
                        .avatarUrl(userDto.getAvatarUrl())
                        .color(userDto.getColor())
                        .canvasId(canvasId)
                        .selection(new ArrayList<>())
                        .cursorX(0)
                        .cursorY(0)
                        .lastActive(System.currentTimeMillis())
                        .build();
            } catch (Exception e) {
                info = OnlineUserInfo.builder()
                        .userId(userId)
                        .username("Guest_" + userId.toString().substring(0, 6))
                        .color("#6B7280")
                        .canvasId(canvasId)
                        .selection(new ArrayList<>())
                        .cursorX(0)
                        .cursorY(0)
                        .lastActive(System.currentTimeMillis())
                        .build();
            }
            redisTemplate.opsForValue().set(userKey, info, 24, TimeUnit.HOURS);
        }

        redisTemplate.opsForSet().add(canvasKey, userId.toString());
        redisTemplate.opsForSet().add(sessionsKey, sessionId);
        redisTemplate.expire(canvasKey, 24, TimeUnit.HOURS);
        redisTemplate.expire(sessionsKey, 24, TimeUnit.HOURS);

        canvasOnlineUsers.computeIfAbsent(canvasId, k -> ConcurrentHashMap.newKeySet()).add(userId);

        List<OnlineUserInfo> allUsers = getOnlineUsers(canvasId);

        UserPresenceMessage msg = UserPresenceMessage.builder()
                .type("JOIN")
                .user(info)
                .allUsers(allUsers)
                .build();

        messagingTemplate.convertAndSend("/topic/canvas/" + canvasId + "/presence", msg);
        log.debug("User {} joined canvas {}", userId, canvasId);
    }

    public void userDisconnected(UUID userId, String sessionId) {
        String sessionsKey = USER_SESSIONS_KEY.replace("{userId}", userId.toString());
        redisTemplate.opsForSet().remove(sessionsKey, sessionId);

        Long remaining = redisTemplate.opsForSet().size(sessionsKey);
        if (remaining == null || remaining == 0) {
            for (Map.Entry<UUID, Set<UUID>> entry : canvasOnlineUsers.entrySet()) {
                if (entry.getValue().remove(userId)) {
                    String canvasKey = ONLINE_USERS_KEY.replace("{canvasId}", entry.getKey().toString());
                    redisTemplate.opsForSet().remove(canvasKey, userId.toString());

                    List<OnlineUserInfo> allUsers = getOnlineUsers(entry.getKey());
                    UserPresenceMessage msg = UserPresenceMessage.builder()
                            .type("LEAVE")
                            .user(OnlineUserInfo.builder().userId(userId).build())
                            .allUsers(allUsers)
                            .build();
                    messagingTemplate.convertAndSend(
                            "/topic/canvas/" + entry.getKey() + "/presence", msg);
                }
            }
            redisTemplate.delete(USER_INFO_KEY.replace("{userId}", userId.toString()));
        }
    }

    public void updateCursor(UUID canvasId, UUID userId, double x, double y) {
        String userKey = USER_INFO_KEY.replace("{userId}", userId.toString());
        OnlineUserInfo info = (OnlineUserInfo) redisTemplate.opsForValue().get(userKey);
        if (info != null) {
            info.setCursorX(x);
            info.setCursorY(y);
            info.setLastActive(System.currentTimeMillis());
            redisTemplate.opsForValue().set(userKey, info, 24, TimeUnit.HOURS);

            messagingTemplate.convertAndSend(
                    "/topic/canvas/" + canvasId + "/cursors",
                    Map.of("userId", userId, "x", x, "y", y, "timestamp", System.currentTimeMillis())
            );
        }
    }

    public void updateSelection(UUID canvasId, UUID userId, List<UUID> selection) {
        String userKey = USER_INFO_KEY.replace("{userId}", userId.toString());
        OnlineUserInfo info = (OnlineUserInfo) redisTemplate.opsForValue().get(userKey);
        if (info != null) {
            info.setSelection(selection);
            info.setLastActive(System.currentTimeMillis());
            redisTemplate.opsForValue().set(userKey, info, 24, TimeUnit.HOURS);

            messagingTemplate.convertAndSend(
                    "/topic/canvas/" + canvasId + "/selections",
                    Map.of("userId", userId, "selection", selection, "timestamp", System.currentTimeMillis())
            );
        }
    }

    public List<OnlineUserInfo> getOnlineUsers(UUID canvasId) {
        String canvasKey = ONLINE_USERS_KEY.replace("{canvasId}", canvasId.toString());
        Set<Object> members = redisTemplate.opsForSet().members(canvasKey);
        List<OnlineUserInfo> result = new ArrayList<>();
        if (members == null) return result;

        for (Object m : members) {
            try {
                String userKey = USER_INFO_KEY.replace("{userId}", m.toString());
                OnlineUserInfo info = (OnlineUserInfo) redisTemplate.opsForValue().get(userKey);
                if (info != null) {
                    result.add(info);
                }
            } catch (Exception ignored) {
            }
        }
        return result;
    }
}
