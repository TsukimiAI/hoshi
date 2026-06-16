package com.tsukimiai.hoshi.ai.service.impl;

import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

import org.springframework.util.StringUtils;

import com.tsukimiai.hoshi.ai.cognition.AiCognitionInput;
import com.tsukimiai.hoshi.ai.model.AiChatTurn;

final class AiEmotionSupport {

    private static final Pattern CODE_KEYWORD_PATTERN = Pattern.compile(
            "\\b(public|private|class|interface|enum|void|return|import|const|let|var|function|def|SELECT|INSERT|UPDATE|DELETE|FROM|WHERE)\\b",
            Pattern.CASE_INSENSITIVE);

    private static final Map<String, String> EMOTION_ALIASES = Map.ofEntries(
            Map.entry("正常", "normal"),
            Map.entry("开心", "happy"),
            Map.entry("很高兴", "very-happy"),
            Map.entry("害羞", "shy"),
            Map.entry("困惑", "confused"),
            Map.entry("疑惑", "doubt"),
            Map.entry("生气", "angry"),
            Map.entry("难过", "sad"),
            Map.entry("惊讶", "shock"),
            Map.entry("期待", "expect"),
            Map.entry("喜欢", "like"),
            Map.entry("很喜欢", "very-like"));

    List<String> readAllowedEmotions(AiCognitionInput input) {
        if (input == null || input.metadata() == null) {
            return List.of();
        }
        Object value = input.metadata().get("allowedEmotions");
        if (value instanceof List<?> list) {
            return list.stream()
                    .filter(String.class::isInstance)
                    .map(String.class::cast)
                    .toList();
        }
        return List.of();
    }

    String latestTurnContent(AiCognitionInput input) {
        if (input == null || input.recentTurns() == null || input.recentTurns().isEmpty()) {
            return "";
        }
        AiChatTurn turn = input.recentTurns().get(input.recentTurns().size() - 1);
        return turn == null || turn.content() == null ? "" : turn.content().trim();
    }

    String findTurnContent(AiCognitionInput input, String role) {
        if (input == null || input.recentTurns() == null) {
            return null;
        }
        return input.recentTurns().stream()
                .filter(turn -> turn != null && StringUtils.hasText(turn.content()) && role.equalsIgnoreCase(turn.role()))
                .map(turn -> turn.content().trim())
                .reduce((first, second) -> second)
                .orElse(null);
    }

    String sanitizeTitle(String title) {
        if (!StringUtils.hasText(title)) {
            return null;
        }
        String normalized = title.trim()
                .replaceAll("[\"'「」『』]", "")
                .replaceAll("[\\r\\n]+", " ")
                .strip();
        if (normalized.length() > 32) {
            normalized = normalized.substring(0, 32).trim();
        }
        return StringUtils.hasText(normalized) ? normalized : null;
    }

    String resolveAllowedEmotion(String raw, List<String> allowedEmotions) {
        if (!StringUtils.hasText(raw) || allowedEmotions == null || allowedEmotions.isEmpty()) {
            return null;
        }
        String trimmed = raw.trim();
        String sanitized = sanitizeEmotionValue(trimmed);
        if (StringUtils.hasText(sanitized)) {
            for (String allowed : allowedEmotions) {
                if (allowed.equalsIgnoreCase(sanitized)) {
                    return allowed;
                }
            }
        }
        String alias = EMOTION_ALIASES.get(trimmed);
        if (alias != null && allowedEmotions.contains(alias)) {
            return alias;
        }
        for (String allowed : allowedEmotions) {
            if (trimmed.equalsIgnoreCase(allowed)) {
                return allowed;
            }
        }
        String lowered = trimmed.toLowerCase(Locale.ROOT);
        return allowedEmotions.stream()
                .sorted(Comparator.comparingInt(String::length).reversed())
                .filter(allowed -> lowered.contains(allowed.toLowerCase(Locale.ROOT)))
                .findFirst()
                .orElse(null);
    }

    boolean looksLikeCodeContent(String text) {
        String trimmed = text.trim();
        if (trimmed.startsWith("```") || trimmed.contains("\n```") || trimmed.contains("`")) {
            return true;
        }

        int codeSignals = 0;
        if (trimmed.contains("->") || trimmed.contains("::") || trimmed.contains("()")) {
            codeSignals++;
        }
        if (trimmed.contains("{") || trimmed.contains("}") || trimmed.contains(";")) {
            codeSignals++;
        }
        if (trimmed.contains(" = ") || trimmed.contains("==") || trimmed.contains("!=")) {
            codeSignals++;
        }
        if (trimmed.contains("<") && trimmed.contains(">")) {
            codeSignals++;
        }
        if (CODE_KEYWORD_PATTERN.matcher(trimmed).find()) {
            codeSignals++;
        }

        long symbolCount = trimmed.chars()
                .filter(ch -> "{}[]();<>=`/\\_".indexOf(ch) >= 0)
                .count();
        double symbolRatio = trimmed.isEmpty() ? 0 : (double) symbolCount / trimmed.length();
        if (isMostlyNaturalLanguage(trimmed) && codeSignals < 3) {
            return false;
        }

        return codeSignals >= 2 || symbolRatio > 0.12;
    }

    private String sanitizeEmotionValue(String emotion) {
        String normalized = emotion.trim()
                .replaceAll("[\"'`“”‘’]", "")
                .replace('_', '-')
                .replaceAll("[\\r\\n]+", " ")
                .replaceAll("\\s+", "-")
                .toLowerCase(Locale.ROOT)
                .replaceAll("^[^a-z-]+", "")
                .replaceAll("[^a-z-]+$", "");
        return StringUtils.hasText(normalized) ? normalized : null;
    }

    private boolean isMostlyNaturalLanguage(String text) {
        long letterCount = text.codePoints()
                .filter(Character::isLetter)
                .count();
        if (letterCount == 0) {
            return false;
        }
        long cjkCount = text.codePoints()
                .filter(ch -> Character.UnicodeScript.of(ch) == Character.UnicodeScript.HAN)
                .count();
        return cjkCount >= letterCount / 2;
    }
}
