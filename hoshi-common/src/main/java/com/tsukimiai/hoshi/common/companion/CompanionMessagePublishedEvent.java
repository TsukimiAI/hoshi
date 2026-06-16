package com.tsukimiai.hoshi.common.companion;

/**
 * Cross-module contract for proactive companion messages.
 * Published by conversation; consumed by companion WebSocket layer.
 */
public record CompanionMessagePublishedEvent(
        String character,
        Long sessionId,
        Long messageId,
        String content,
        String emotion) {
}
