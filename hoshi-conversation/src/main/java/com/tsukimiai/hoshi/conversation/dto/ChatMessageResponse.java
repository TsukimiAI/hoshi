package com.tsukimiai.hoshi.conversation.dto;

import java.time.LocalDateTime;
import java.util.List;

import com.tsukimiai.hoshi.conversation.entity.ChatMessage;

public record ChatMessageResponse(
        String id,
        String role,
        String content,
        String emotion,
        List<ChatMessageSegmentResponse> segments,
        LocalDateTime createdAt) {

    public static ChatMessageResponse from(ChatMessage message) {
        return new ChatMessageResponse(
                String.valueOf(message.getId()),
                message.getRole(),
                message.getContent(),
                message.getEmotion(),
                message.getSegments() == null ? List.of() : message.getSegments().stream()
                        .map(ChatMessageSegmentResponse::from)
                        .toList(),
                message.getCreatedAt());
    }
}
