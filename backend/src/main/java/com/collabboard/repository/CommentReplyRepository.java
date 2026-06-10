package com.collabboard.repository;

import com.collabboard.entity.CommentReply;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface CommentReplyRepository extends JpaRepository<CommentReply, UUID> {
    List<CommentReply> findByCommentIdOrderByCreatedAtAsc(UUID commentId);

    int countByCommentId(UUID commentId);

    void deleteByCommentId(UUID commentId);
}
