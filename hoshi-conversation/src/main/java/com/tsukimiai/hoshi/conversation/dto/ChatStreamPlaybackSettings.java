package com.tsukimiai.hoshi.conversation.dto;

import com.tsukimiai.hoshi.ai.config.HoshiAiProperties;

public record ChatStreamPlaybackSettings(
        Integer sentencePlaybackCharDelayMs,
        Integer sentenceGapDelayMs) {

    public static ChatStreamPlaybackSettings empty() {
        return new ChatStreamPlaybackSettings(null, null);
    }

    public int resolveCharDelayMs(HoshiAiProperties properties) {
        return clampDelay(sentencePlaybackCharDelayMs, properties.getSentencePlaybackCharDelayMs(), 200);
    }

    public int resolveGapDelayMs(HoshiAiProperties properties) {
        return clampDelay(sentenceGapDelayMs, properties.getSentenceGapDelayMs(), 3000);
    }

    private static int clampDelay(Integer requested, int defaultValue, int max) {
        if (requested == null) {
            return defaultValue;
        }
        return Math.max(0, Math.min(requested, max));
    }
}
