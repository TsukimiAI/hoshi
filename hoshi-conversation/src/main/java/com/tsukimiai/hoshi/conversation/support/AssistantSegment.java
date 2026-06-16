package com.tsukimiai.hoshi.conversation.support;

import com.tsukimiai.hoshi.common.companion.CompanionEmotion;

public record AssistantSegment(
        int seq,
        String content,
        CompanionEmotion emotion) {
}
