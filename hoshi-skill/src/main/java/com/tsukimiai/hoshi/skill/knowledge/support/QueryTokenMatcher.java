package com.tsukimiai.hoshi.skill.knowledge.support;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

import org.springframework.util.StringUtils;

public final class QueryTokenMatcher {

    private static final Pattern TOKEN_SPLIT_PATTERN = Pattern.compile("[\\s,，。！？、;；:：\"'（）()\\[\\]{}<>《》]+");

    private QueryTokenMatcher() {
    }

    public static double hitRate(String query, String content) {
        List<String> tokens = tokenize(query);
        if (tokens.isEmpty()) {
            return 0.0;
        }
        String normalizedContent = normalize(content);
        if (!StringUtils.hasText(normalizedContent)) {
            return 0.0;
        }
        long hits = tokens.stream().filter(token -> normalizedContent.contains(token)).count();
        return (double) hits / tokens.size();
    }

    static List<String> tokenize(String query) {
        if (!StringUtils.hasText(query)) {
            return List.of();
        }
        Set<String> tokens = new LinkedHashSet<>();
        String normalized = normalize(query);
        for (String part : TOKEN_SPLIT_PATTERN.split(normalized)) {
            if (!StringUtils.hasText(part)) {
                continue;
            }
            addTokenVariants(tokens, part.trim());
        }
        if (tokens.isEmpty() && normalized.length() >= 2) {
            addTokenVariants(tokens, normalized);
        }
        return new ArrayList<>(tokens);
    }

    private static void addTokenVariants(Set<String> tokens, String value) {
        if (!StringUtils.hasText(value)) {
            return;
        }
        if (value.length() >= 2) {
            tokens.add(value);
        }
        if (value.length() >= 4) {
            for (int i = 0; i <= value.length() - 2; i++) {
                tokens.add(value.substring(i, i + 2));
            }
        }
    }

    static String normalize(String text) {
        if (!StringUtils.hasText(text)) {
            return "";
        }
        return text.strip()
                .toLowerCase(Locale.ROOT)
                .replaceAll("\\s+", "")
                .replaceAll("[，。！？、,.!?;；:：“”\"'`（）()\\[\\]{}<>《》]", "");
    }
}
