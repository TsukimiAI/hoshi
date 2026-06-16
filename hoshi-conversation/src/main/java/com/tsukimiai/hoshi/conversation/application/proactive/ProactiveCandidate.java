package com.tsukimiai.hoshi.conversation.application.proactive;

import com.tsukimiai.hoshi.conversation.entity.ProactiveSourceType;

public record ProactiveCandidate(
        Long userId,
        Long sessionId,
        ProactiveSourceType sourceType,
        String sourceKey,
        String hint,
        double priority,
        String memoryCategory) {
}
