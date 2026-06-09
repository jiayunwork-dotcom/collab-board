package com.collabboard.collaboration;

import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.stereotype.Component;

import java.security.Principal;
import java.util.UUID;

@Component
public class UserSubscriptionInterceptor implements ChannelInterceptor {

    private final OnlineUserService onlineUserService;

    public UserSubscriptionInterceptor(OnlineUserService onlineUserService) {
        this.onlineUserService = onlineUserService;
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null) return message;

        if (StompCommand.CONNECT.equals(accessor.getCommand())) {
            Object raw = accessor.getMessageHeaders().get("simpSessionAttributes");
            if (raw instanceof java.util.Map attrs) {
                Object userIdObj = attrs.get("userId");
                if (userIdObj instanceof UUID userId) {
                    accessor.setUser(new WebSocketPrincipal(userId, attrs.get("anonymous") != null));
                }
            }
        } else if (StompCommand.SUBSCRIBE.equals(accessor.getCommand())) {
            String dest = accessor.getDestination();
            if (dest != null && dest.startsWith("/topic/canvas/")) {
                String canvasId = dest.substring("/topic/canvas/".length());
                Principal user = accessor.getUser();
                if (user instanceof WebSocketPrincipal wsp) {
                    String sessionId = accessor.getSessionId();
                    onlineUserService.userJoined(UUID.fromString(canvasId), wsp.getUserId(), sessionId);
                }
            }
        } else if (StompCommand.UNSUBSCRIBE.equals(accessor.getCommand())
                || StompCommand.DISCONNECT.equals(accessor.getCommand())) {
            Principal user = accessor.getUser();
            if (user instanceof WebSocketPrincipal wsp) {
                String sessionId = accessor.getSessionId();
                onlineUserService.userDisconnected(wsp.getUserId(), sessionId);
            }
        }

        return message;
    }
}
