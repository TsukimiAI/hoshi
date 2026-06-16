package com.tsukimiai.hoshi.conversation.application.proactive;

import java.time.LocalDateTime;
import java.util.List;

public record ProactivePolicyContext(
        LocalDateTime now,
        LocalDateTime lastUserMessageAt,
        LocalDateTime lastProactiveAt,
        int todayProactiveCount,
        List<String> recentSourceKeys,
        boolean userEnabled) {
}
