package com.tsukimiai.hoshi.conversation.dto;

import java.time.LocalDateTime;

import com.tsukimiai.hoshi.conversation.entity.ChatMessage;

public record ChatMessageResponse(
        String id,
        String role,
        String content,
        LocalDateTime createdAt) {

    public static ChatMessageResponse from(ChatMessage message) {
        return new ChatMessageResponse(
                String.valueOf(message.getId()),
                message.getRole(),
                message.getContent(),
                message.getCreatedAt());
    }
}
