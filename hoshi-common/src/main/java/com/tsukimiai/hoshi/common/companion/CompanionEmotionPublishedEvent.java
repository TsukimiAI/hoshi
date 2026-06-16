package com.tsukimiai.hoshi.common.companion;

/**
 * Cross-module contract for companion emotion updates.
 * Published by conversation; consumed by companion WebSocket layer.
 */
public record CompanionEmotionPublishedEvent(
        String character,
        CompanionEmotion emotion,
        CompanionEventSource source,
        Long messageId,
        Integer segmentSeq) {
}
