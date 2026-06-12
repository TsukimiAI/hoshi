package com.tsukimiai.hoshi.conversation.dto;

import java.time.LocalDateTime;

import com.tsukimiai.hoshi.conversation.entity.ChatMessageSegment;

public record ChatMessageSegmentResponse(
        String id,
        int seq,
        String content,
        String emotion,
        LocalDateTime createdAt) {

    public static ChatMessageSegmentResponse from(ChatMessageSegment segment) {
        return new ChatMessageSegmentResponse(
                String.valueOf(segment.getId()),
                segment.getSeq(),
                segment.getContent(),
                segment.getEmotion(),
                segment.getCreatedAt());
    }
}
