package com.tsukimiai.hoshi.conversation.dto;

public record SendChatMessageResponse(
        ChatMessageResponse userMessage,
        ChatMessageResponse assistantMessage) {
}
