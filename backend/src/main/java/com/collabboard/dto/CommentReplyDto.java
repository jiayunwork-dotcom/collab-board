package com.collabboard.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CommentReplyDto {
    private UUID id;
    private UUID commentId;
    private UUID userId;
    private String username;
    private String userAvatar;
    private String userColor;
    private String content;
    private List<UUID> mentions;
    private OffsetDateTime createdAt;
}
