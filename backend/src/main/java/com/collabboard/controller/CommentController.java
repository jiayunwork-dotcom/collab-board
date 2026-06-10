package com.collabboard.controller;

import com.collabboard.dto.CommentDto;
import com.collabboard.dto.CommentReplyDto;
import com.collabboard.dto.CommentWithRepliesDto;
import com.collabboard.dto.CreateCommentRequest;
import com.collabboard.dto.CreateReplyRequest;
import com.collabboard.service.CommentService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping
public class CommentController {

    private final CommentService commentService;

    public CommentController(CommentService commentService) {
        this.commentService = commentService;
    }

    @PostMapping("/canvases/{id}/comments")
    public ResponseEntity<CommentWithRepliesDto> createComment(
            Authentication authentication,
            @PathVariable UUID id,
            @RequestBody CreateCommentRequest request) {
        UUID userId = (UUID) authentication.getPrincipal();
        return ResponseEntity.ok(commentService.createComment(id, userId, request));
    }

    @GetMapping("/canvases/{id}/comments")
    public ResponseEntity<List<CommentDto>> getComments(
            Authentication authentication,
            @PathVariable UUID id) {
        UUID userId = authentication != null ? (UUID) authentication.getPrincipal() : null;
        return ResponseEntity.ok(commentService.getCommentsByCanvas(id, userId));
    }

    @GetMapping("/comments/{id}")
    public ResponseEntity<CommentWithRepliesDto> getComment(
            Authentication authentication,
            @PathVariable UUID id) {
        UUID userId = authentication != null ? (UUID) authentication.getPrincipal() : null;
        return ResponseEntity.ok(commentService.getCommentWithReplies(id, userId));
    }

    @PostMapping("/comments/{id}/replies")
    public ResponseEntity<CommentReplyDto> addReply(
            Authentication authentication,
            @PathVariable UUID id,
            @RequestBody CreateReplyRequest request) {
        UUID userId = (UUID) authentication.getPrincipal();
        return ResponseEntity.ok(commentService.addReply(id, userId, request));
    }
}
