package com.collabboard.service;

import com.collabboard.dto.*;
import com.collabboard.entity.*;
import com.collabboard.repository.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Slf4j
@Service
public class CommentService {

    private static final Pattern MENTION_PATTERN = Pattern.compile("@([^|\\s]+)\\|([0-9a-fA-F-]{36})");

    private final CommentRepository commentRepository;
    private final CommentReplyRepository replyRepository;
    private final UserRepository userRepository;
    private final CanvasElementRepository elementRepository;
    private final CanvasService canvasService;
    private final NotificationService notificationService;
    private final SimpMessagingTemplate messagingTemplate;
    private final ObjectMapper objectMapper;

    public CommentService(CommentRepository commentRepository,
                          CommentReplyRepository replyRepository,
                          UserRepository userRepository,
                          CanvasElementRepository elementRepository,
                          CanvasService canvasService,
                          NotificationService notificationService,
                          SimpMessagingTemplate messagingTemplate,
                          ObjectMapper objectMapper) {
        this.commentRepository = commentRepository;
        this.replyRepository = replyRepository;
        this.userRepository = userRepository;
        this.elementRepository = elementRepository;
        this.canvasService = canvasService;
        this.notificationService = notificationService;
        this.messagingTemplate = messagingTemplate;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public CommentWithRepliesDto createComment(UUID canvasId, UUID userId, CreateCommentRequest req) {
        canvasService.checkCommentPermission(canvasId, userId);

        Double anchorX = req.getAnchorX();
        Double anchorY = req.getAnchorY();

        if (req.getAttachedElementId() != null) {
            CanvasElement el = elementRepository.findById(req.getAttachedElementId())
                    .orElseThrow(() -> new RuntimeException("Element not found"));
            anchorX = el.getX() + el.getWidth();
            anchorY = el.getY();
        }

        Comment comment = Comment.builder()
                .canvasId(canvasId)
                .anchorX(anchorX != null ? anchorX : 0.0)
                .anchorY(anchorY != null ? anchorY : 0.0)
                .attachedElementId(req.getAttachedElementId())
                .createdBy(userId)
                .createdAt(OffsetDateTime.now())
                .build();
        comment = commentRepository.save(comment);

        List<CommentReplyDto> replies = new ArrayList<>();
        if (req.getContent() != null && !req.getContent().isBlank()) {
            CommentReply reply = createReplyInternal(comment.getId(), userId, req.getContent());
            replies.add(toReplyDto(reply));
        }

        CommentDto commentDto = toCommentDto(comment, replies.size());
        broadcastCommentCreated(canvasId, commentDto);
        processMentions(comment.getId(), canvasId, userId, req.getContent());

        return CommentWithRepliesDto.builder()
                .comment(commentDto)
                .replies(replies)
                .build();
    }

    @Transactional
    public CommentReplyDto addReply(UUID commentId, UUID userId, CreateReplyRequest req) {
        Comment comment = commentRepository.findById(commentId)
                .orElseThrow(() -> new RuntimeException("Comment not found"));
        canvasService.checkCommentPermission(comment.getCanvasId(), userId);

        CommentReply reply = createReplyInternal(commentId, userId, req.getContent());
        CommentReplyDto dto = toReplyDto(reply);

        broadcastReplyCreated(comment.getCanvasId(), commentId, dto);
        processMentions(commentId, comment.getCanvasId(), userId, req.getContent());

        return dto;
    }

    private CommentReply createReplyInternal(UUID commentId, UUID userId, String content) {
        List<UUID> mentions = extractMentionUserIds(content);
        String cleanedContent = cleanContent(content);

        CommentReply reply = CommentReply.builder()
                .commentId(commentId)
                .userId(userId)
                .content(cleanedContent)
                .mentions(mentions)
                .createdAt(OffsetDateTime.now())
                .build();
        return replyRepository.save(reply);
    }

    public List<CommentDto> getCommentsByCanvas(UUID canvasId, UUID userId) {
        canvasService.checkViewPermission(canvasId, userId);
        List<Comment> comments = commentRepository.findByCanvasIdOrderByCreatedAtAsc(canvasId);
        return comments.stream()
                .map(c -> toCommentDto(c, replyRepository.countByCommentId(c.getId())))
                .collect(Collectors.toList());
    }

    public CommentWithRepliesDto getCommentWithReplies(UUID commentId, UUID userId) {
        Comment comment = commentRepository.findById(commentId)
                .orElseThrow(() -> new RuntimeException("Comment not found"));
        canvasService.checkViewPermission(comment.getCanvasId(), userId);

        List<CommentReply> replies = replyRepository.findByCommentIdOrderByCreatedAtAsc(commentId);
        return CommentWithRepliesDto.builder()
                .comment(toCommentDto(comment, replies.size()))
                .replies(replies.stream().map(this::toReplyDto).collect(Collectors.toList()))
                .build();
    }

    private CommentDto toCommentDto(Comment c, int replyCount) {
        User creator = userRepository.findById(c.getCreatedBy()).orElse(null);
        return CommentDto.builder()
                .id(c.getId())
                .canvasId(c.getCanvasId())
                .anchorX(c.getAnchorX())
                .anchorY(c.getAnchorY())
                .attachedElementId(c.getAttachedElementId())
                .createdBy(c.getCreatedBy())
                .createdByName(creator != null ? creator.getUsername() : null)
                .createdByAvatar(creator != null ? creator.getAvatarUrl() : null)
                .createdByColor(creator != null ? creator.getColor() : "#4F46E5")
                .createdAt(c.getCreatedAt())
                .replyCount(replyCount)
                .build();
    }

    private CommentReplyDto toReplyDto(CommentReply r) {
        User user = userRepository.findById(r.getUserId()).orElse(null);
        return CommentReplyDto.builder()
                .id(r.getId())
                .commentId(r.getCommentId())
                .userId(r.getUserId())
                .username(user != null ? user.getUsername() : null)
                .userAvatar(user != null ? user.getAvatarUrl() : null)
                .userColor(user != null ? user.getColor() : "#4F46E5")
                .content(r.getContent())
                .mentions(r.getMentions())
                .createdAt(r.getCreatedAt())
                .build();
    }

    private List<UUID> extractMentionUserIds(String content) {
        if (content == null || content.isBlank()) return new ArrayList<>();
        List<UUID> ids = new ArrayList<>();
        Matcher m = MENTION_PATTERN.matcher(content);
        while (m.find()) {
            try {
                ids.add(UUID.fromString(m.group(2)));
            } catch (Exception ignored) {}
        }
        return ids;
    }

    private String cleanContent(String content) {
        if (content == null) return "";
        return MENTION_PATTERN.matcher(content).replaceAll("@$1");
    }

    private void processMentions(UUID commentId, UUID canvasId, UUID fromUserId, String content) {
        if (content == null || content.isBlank()) return;
        List<UUID> mentionUserIds = extractMentionUserIds(content);
        if (mentionUserIds.isEmpty()) {
            log.debug("No mentions found in content: {}", content);
            return;
        }
        log.info("Processing {} mentions in comment {} by user {}", mentionUserIds.size(), commentId, fromUserId);

        String canvasTitle = "";
        try {
            Canvas canvas = canvasService.getCanvasEntity(canvasId);
            canvasTitle = canvas != null ? canvas.getTitle() : "";
        } catch (Exception e) {
            log.warn("Failed to get canvas info for mention notification, canvasId={}", canvasId, e);
        }

        String fromUserName = "Someone";
        try {
            User fromUser = userRepository.findById(fromUserId).orElse(null);
            fromUserName = fromUser != null ? fromUser.getUsername() : "Someone";
        } catch (Exception e) {
            log.warn("Failed to get user info for mention notification, userId={}", fromUserId, e);
        }

        double anchorX = 0.0;
        double anchorY = 0.0;
        try {
            Comment comment = commentRepository.findById(commentId).orElse(null);
            anchorX = comment != null && comment.getAnchorX() != null ? comment.getAnchorX() : 0.0;
            anchorY = comment != null && comment.getAnchorY() != null ? comment.getAnchorY() : 0.0;
        } catch (Exception e) {
            log.warn("Failed to get comment info for mention notification, commentId={}", commentId, e);
        }

        String cleanedContent = cleanContent(content);

        for (UUID mentionUserId : mentionUserIds) {
            if (mentionUserId.equals(fromUserId)) {
                log.debug("Skipping self-mention for user {}", mentionUserId);
                continue;
            }
            try {
                Map<String, Object> payload = new HashMap<>();
                payload.put("commentId", commentId.toString());
                payload.put("canvasId", canvasId.toString());
                payload.put("canvasTitle", canvasTitle);
                payload.put("fromUserId", fromUserId.toString());
                payload.put("fromUserName", fromUserName);
                payload.put("content", cleanedContent);
                payload.put("anchorX", anchorX);
                payload.put("anchorY", anchorY);

                NotificationDto dto = notificationService.createNotification(mentionUserId, "MENTION", payload);
                log.info("Created mention notification id={} for user={}", dto.getId(), mentionUserId);
            } catch (Exception e) {
                log.error("Failed to create/send mention notification for user={}", mentionUserId, e);
            }
        }
    }

    private void broadcastCommentCreated(UUID canvasId, CommentDto dto) {
        try {
            Map<String, Object> msg = new HashMap<>();
            msg.put("type", "COMMENT_CREATED");
            msg.put("comment", objectMapper.convertValue(dto, Map.class));
            msg.put("timestamp", System.currentTimeMillis());
            messagingTemplate.convertAndSend("/topic/canvas/" + canvasId + "/comments", msg);
        } catch (Exception e) {
            log.warn("Failed to broadcast comment", e);
        }
    }

    private void broadcastReplyCreated(UUID canvasId, UUID commentId, CommentReplyDto dto) {
        try {
            Map<String, Object> msg = new HashMap<>();
            msg.put("type", "REPLY_CREATED");
            msg.put("commentId", commentId.toString());
            msg.put("reply", objectMapper.convertValue(dto, Map.class));
            msg.put("timestamp", System.currentTimeMillis());
            messagingTemplate.convertAndSend("/topic/canvas/" + canvasId + "/comments", msg);
        } catch (Exception e) {
            log.warn("Failed to broadcast reply", e);
        }
    }
}
