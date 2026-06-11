package com.tsukimiai.hoshi.conversation.dto;

import java.time.LocalDateTime;

import com.tsukimiai.hoshi.conversation.entity.ChatSession;

public record ChatSessionResponse(
        String id,
        String title,
        LocalDateTime createdAt,
        LocalDateTime updatedAt) {

    public static ChatSessionResponse from(ChatSession session) {
        return new ChatSessionResponse(
                String.valueOf(session.getId()),
                session.getTitle(),
                session.getCreatedAt(),
                session.getUpdatedAt());
    }
}
