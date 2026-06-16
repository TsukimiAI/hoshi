package com.tsukimiai.hoshi.ai.model;

public record AiChatRequest(
        AiChatContext context,
        boolean webSearchEnabled) {
}
