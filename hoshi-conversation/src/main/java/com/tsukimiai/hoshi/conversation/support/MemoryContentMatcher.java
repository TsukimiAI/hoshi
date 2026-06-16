package com.tsukimiai.hoshi.conversation.support;

import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import org.springframework.util.StringUtils;

import com.tsukimiai.hoshi.conversation.entity.UserMemory;

public final class MemoryContentMatcher {

    private static final String MEMORY_STATUS_ACTIVE = "active";
    private static final String MEMORY_TYPE_LONG = "long";
    private static final double SAME_CATEGORY_SIMILARITY_THRESHOLD = 0.72;
    private static final double LONG_CROSS_CATEGORY_SIMILARITY_THRESHOLD = 0.82;

    public static final double STALE_HINT_SIMILARITY_THRESHOLD = 0.65;

    private MemoryContentMatcher() {
    }

    public static UserMemory findMatchingMemory(
            List<UserMemory> existing,
            String memoryType,
            String category,
            String content) {
        if (existing == null || existing.isEmpty() || !StringUtils.hasText(content)) {
            return null;
        }
        String normalizedType = normalizeToken(memoryType);
        String normalizedCategory = normalizeToken(category);
        String normalizedContent = normalizeContent(content);

        UserMemory bestSameCategory = null;
        double bestSameCategoryScore = 0.0;
        UserMemory bestCrossCategory = null;
        double bestCrossCategoryScore = 0.0;

        for (UserMemory memory : existing) {
            if (!MEMORY_STATUS_ACTIVE.equalsIgnoreCase(memory.getStatus())) {
                continue;
            }
            if (!normalizedType.equalsIgnoreCase(normalizeToken(memory.getMemoryType()))) {
                continue;
            }
            double score = matchScore(normalizedContent, normalizeContent(memory.getContent()));
            if (score <= 0.0) {
                continue;
            }
            if (normalizedCategory.equalsIgnoreCase(normalizeToken(memory.getCategory()))) {
                if (score >= SAME_CATEGORY_SIMILARITY_THRESHOLD && score > bestSameCategoryScore) {
                    bestSameCategory = memory;
                    bestSameCategoryScore = score;
                }
                continue;
            }
            if (MEMORY_TYPE_LONG.equalsIgnoreCase(normalizedType)
                    && score >= LONG_CROSS_CATEGORY_SIMILARITY_THRESHOLD
                    && score > bestCrossCategoryScore) {
                bestCrossCategory = memory;
                bestCrossCategoryScore = score;
            }
        }

        if (bestSameCategory != null) {
            return bestSameCategory;
        }
        return bestCrossCategory;
    }

    public static UserMemory findBestMatchByHint(List<UserMemory> existing, String hint, double threshold) {
        if (existing == null || existing.isEmpty() || !StringUtils.hasText(hint)) {
            return null;
        }
        String normalizedHint = normalizeContent(hint);
        UserMemory best = null;
        double bestScore = 0.0;
        for (UserMemory memory : existing) {
            if (!MEMORY_STATUS_ACTIVE.equalsIgnoreCase(memory.getStatus())) {
                continue;
            }
            double score = matchScore(normalizedHint, normalizeContent(memory.getContent()));
            if (score >= threshold && score > bestScore) {
                best = memory;
                bestScore = score;
            }
        }
        return best;
    }

    public static double similarity(String left, String right) {
        return matchScore(normalizeContent(left), normalizeContent(right));
    }

    public static String preferRicherContent(String current, String incoming) {
        if (!StringUtils.hasText(current)) {
            return incoming == null ? "" : incoming.trim();
        }
        if (!StringUtils.hasText(incoming)) {
            return current.trim();
        }
        String left = current.trim();
        String right = incoming.trim();
        if (right.length() > left.length()) {
            return right;
        }
        return left;
    }

    private static double matchScore(String left, String right) {
        if (!StringUtils.hasText(left) || !StringUtils.hasText(right)) {
            return 0.0;
        }
        if (left.equals(right)) {
            return 1.0;
        }
        if (left.contains(right) || right.contains(left)) {
            return 0.95;
        }
        double bigramScore = bigramSimilarity(left, right);
        int sharedSegmentLength = longestSharedSegmentLength(left, right);
        if (sharedSegmentLength >= 4) {
            return Math.max(bigramScore, 0.78);
        }
        if (sharedSegmentLength >= 3) {
            return Math.max(bigramScore, 0.72);
        }
        return bigramScore;
    }

    private static double bigramSimilarity(String left, String right) {
        Set<String> leftBigrams = buildBigrams(left);
        Set<String> rightBigrams = buildBigrams(right);
        if (leftBigrams.isEmpty() || rightBigrams.isEmpty()) {
            return 0.0;
        }
        long intersection = leftBigrams.stream().filter(rightBigrams::contains).count();
        return (2.0 * intersection) / (leftBigrams.size() + rightBigrams.size());
    }

    private static int longestSharedSegmentLength(String left, String right) {
        int max = 0;
        for (int start = 0; start < left.length(); start++) {
            for (int end = start + 1; end <= left.length(); end++) {
                String segment = left.substring(start, end);
                if (segment.length() <= max || segment.length() < 3) {
                    continue;
                }
                if (right.contains(segment)) {
                    max = segment.length();
                }
            }
        }
        return max;
    }

    private static Set<String> buildBigrams(String value) {
        Set<String> grams = new HashSet<>();
        if (value.length() < 2) {
            grams.add(value);
            return grams;
        }
        for (int index = 0; index < value.length() - 1; index++) {
            grams.add(value.substring(index, index + 2));
        }
        return grams;
    }

    public static String normalizeContent(String content) {
        if (!StringUtils.hasText(content)) {
            return "";
        }
        return content.strip()
                .toLowerCase(Locale.ROOT)
                .replaceAll("\\s+", "")
                .replaceAll("[，。！？、,.!?;；:：“”\"'`（）()\\[\\]{}<>《》]", "");
    }

    private static String normalizeToken(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }
}
