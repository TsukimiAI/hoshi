package com.tsukimiai.hoshi.conversation.support;

import com.tsukimiai.hoshi.ai.config.HoshiAiProperties;
import com.tsukimiai.hoshi.conversation.dto.ChatStreamPlaybackSettings;

public record StreamPlaybackContext(int charDelayMs, int gapDelayMs) {

    public static StreamPlaybackContext from(
            HoshiAiProperties properties,
            ChatStreamPlaybackSettings settings) {
        return new StreamPlaybackContext(
                settings.resolveCharDelayMs(properties),
                settings.resolveGapDelayMs(properties));
    }
}
