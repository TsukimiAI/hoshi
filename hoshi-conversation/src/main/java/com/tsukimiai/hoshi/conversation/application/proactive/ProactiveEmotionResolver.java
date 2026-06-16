package com.tsukimiai.hoshi.conversation.application.proactive;

import java.util.Set;

import org.springframework.util.StringUtils;

import com.tsukimiai.hoshi.common.companion.CompanionEmotion;
import com.tsukimiai.hoshi.conversation.entity.ProactiveSourceType;

final class ProactiveEmotionResolver {

    private static final Set<String> OPENING_LLM_EMOTIONS = Set.of("normal", "happy", "expect", "shy");

    private ProactiveEmotionResolver() {
    }

    static CompanionEmotion resolveOpening(
            String llmEmotion,
            ProactiveSourceType sourceType,
            String memoryCategory) {
        if (isAllowedOpeningEmotion(llmEmotion)) {
            return CompanionEmotion.fromValue(llmEmotion);
        }
        return resolve(sourceType, memoryCategory);
    }

    private static boolean isAllowedOpeningEmotion(String llmEmotion) {
        if (!StringUtils.hasText(llmEmotion)) {
            return false;
        }
        return OPENING_LLM_EMOTIONS.contains(llmEmotion.trim().toLowerCase());
    }

    static CompanionEmotion resolve(ProactiveSourceType sourceType, String memoryCategory) {
        if (sourceType == ProactiveSourceType.OPEN_LOOP) {
            return CompanionEmotion.EXPECT;
        }
        String category = memoryCategory == null ? "" : memoryCategory.trim().toLowerCase();
        if (!StringUtils.hasText(category)) {
            return CompanionEmotion.NORMAL;
        }
        return switch (category) {
            case "mood" -> CompanionEmotion.SAD;
            case "plan", "temporary_goal", "current_focus" -> CompanionEmotion.HAPPY;
            case "recent_event" -> CompanionEmotion.SHOCK;
            default -> CompanionEmotion.NORMAL;
        };
    }
}
