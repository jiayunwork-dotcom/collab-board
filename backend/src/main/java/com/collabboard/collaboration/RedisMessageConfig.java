package com.collabboard.collaboration;

import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.data.redis.listener.PatternTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.data.redis.listener.adapter.MessageListenerAdapter;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import com.fasterxml.jackson.databind.ObjectMapper;

@Slf4j
@Configuration
public class RedisMessageConfig {

    private final SimpMessagingTemplate messagingTemplate;
    private final ObjectMapper objectMapper;

    public RedisMessageConfig(SimpMessagingTemplate messagingTemplate, ObjectMapper objectMapper) {
        this.messagingTemplate = messagingTemplate;
        this.objectMapper = objectMapper;
    }

    @Bean
    public MessageListenerAdapter redisOpMessageListener() {
        return new MessageListenerAdapter(new RedisOpSubscriber(messagingTemplate, objectMapper));
    }

    @Bean
    public PatternTopic opPatternTopic() {
        return new PatternTopic("collab:canvas:*:ops");
    }

    @Slf4j
    public static class RedisOpSubscriber implements MessageListener {

        private final SimpMessagingTemplate messagingTemplate;
        private final ObjectMapper objectMapper;

        public RedisOpSubscriber(SimpMessagingTemplate messagingTemplate, ObjectMapper objectMapper) {
            this.messagingTemplate = messagingTemplate;
            this.objectMapper = objectMapper;
        }

        @Override
        public void onMessage(Message message, byte[] pattern) {
            try {
                String channel = new String(message.getChannel());
                String canvasId = channel.split(":")[2];

                CollaborationController.CollabMessage msg =
                        objectMapper.readValue(message.getBody(), CollaborationController.CollabMessage.class);

                messagingTemplate.convertAndSend("/topic/canvas/" + canvasId + "/operations", msg);
                log.trace("Forwarded Redis op to WS: canvas={}, type={}", canvasId, msg.getType());
            } catch (Exception e) {
                log.error("Failed to process Redis message", e);
            }
        }
    }
}
