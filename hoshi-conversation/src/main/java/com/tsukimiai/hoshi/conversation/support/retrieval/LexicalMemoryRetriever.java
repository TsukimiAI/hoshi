package com.tsukimiai.hoshi.conversation.support.retrieval;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.tsukimiai.hoshi.ai.config.HoshiAiProperties;
import com.tsukimiai.hoshi.ai.model.AiMemoryContext;
import com.tsukimiai.hoshi.conversation.entity.UserMemory;
import com.tsukimiai.hoshi.conversation.mapper.UserMemoryMapper;
import com.tsukimiai.hoshi.conversation.support.MemoryContentMatcher;
import com.tsukimiai.hoshi.conversation.support.ScoredMemory;

@Component
public class LexicalMemoryRetriever implements MemoryRetriever {

    private static final String MEMORY_STATUS_ACTIVE = "active";
    private static final String MEMORY_STATUS_ARCHIVED = "archived";
    private static final String MEMORY_TYPE_SHORT = "short";
    private static final String MEMORY_TYPE_LONG = "long";

    private final UserMemoryMapper userMemoryMapper;
    private final HoshiAiProperties hoshiAiProperties;

    public LexicalMemoryRetriever(UserMemoryMapper userMemoryMapper, HoshiAiProperties hoshiAiProperties) {
        this.userMemoryMapper = userMemoryMapper;
        this.hoshiAiProperties = hoshiAiProperties;
    }

    @Override
    public List<AiMemoryContext> retrieveShort(Long userId, String query, int budgetTokens) {
        List<UserMemory> memories = listActiveMemories(userId, MEMORY_TYPE_SHORT);
        List<ScoredMemory> scored = new ArrayList<>();
        for (UserMemory memory : memories) {
            double retention = calculateRetention(memory);
            if (retention < hoshiAiProperties.getShortMemoryRetentionThreshold()) {
                archiveMemory(memory);
                continue;
            }
            double score = scoreShortMemory(memory, query, retention);
            if (score < hoshiAiProperties.getShortMemoryMinScore()) {
                continue;
            }
            scored.add(new ScoredMemory(memory, score, retention));
        }
        scored = preferLatestReinforcedPlanMemories(scored);
        scored.sort(Comparator.comparingDouble(ScoredMemory::score).reversed());
        return trimMemories(scored, budgetTokens, hoshiAiProperties.getQueryRelevantShortMemoryLimit());
    }

    @Override
    public List<AiMemoryContext> retrieveLong(Long userId, String query, int budgetTokens) {
        List<UserMemory> memories = listActiveMemories(userId, MEMORY_TYPE_LONG);
        List<ScoredMemory> pinned = new ArrayList<>();
        List<ScoredMemory> relevant = new ArrayList<>();
        for (UserMemory memory : memories) {
            double importance = safeScore(memory.getImportanceScore(), 0.0);
            double similarity = MemoryContentMatcher.similarity(memory.getContent(), query);
            if (memory.getAlwaysPinned() != null && memory.getAlwaysPinned() == 1) {
                pinned.add(new ScoredMemory(memory, Math.max(importance, similarity), 1.0));
            } else if (Math.max(similarity, importance) >= hoshiAiProperties.getLongMemoryMinScore()) {
                relevant.add(new ScoredMemory(memory, Math.max(similarity, importance), 1.0));
            }
        }
        pinned.sort(Comparator.comparingDouble(ScoredMemory::score).reversed());
        relevant.sort(Comparator.comparingDouble(ScoredMemory::score).reversed());
        List<ScoredMemory> combined = new ArrayList<>();
        combined.addAll(pinned.stream().limit(hoshiAiProperties.getLongMemoryAlwaysPinnedLimit()).toList());
        Set<Long> usedIds = combined.stream()
                .map(item -> item.memory().getId())
                .collect(HashSet::new, Set::add, Set::addAll);
        relevant.stream()
                .filter(item -> !usedIds.contains(item.memory().getId()))
                .limit(hoshiAiProperties.getQueryRelevantLongMemoryLimit())
                .forEach(combined::add);
        return trimMemories(
                combined,
                budgetTokens,
                hoshiAiProperties.getLongMemoryAlwaysPinnedLimit() + hoshiAiProperties.getQueryRelevantLongMemoryLimit());
    }

    private List<ScoredMemory> preferLatestReinforcedPlanMemories(List<ScoredMemory> scored) {
        if (scored == null || scored.size() <= 1) {
            return scored;
        }
        Set<String> planCategories = Set.of("plan", "temporary_goal");
        Map<String, List<ScoredMemory>> grouped = new java.util.LinkedHashMap<>();
        List<ScoredMemory> unaffected = new ArrayList<>();
        for (ScoredMemory item : scored) {
            String category = normalizeCategory(item.memory().getCategory());
            if (planCategories.contains(category)) {
                grouped.computeIfAbsent(category, key -> new ArrayList<>()).add(item);
            } else {
                unaffected.add(item);
            }
        }
        List<ScoredMemory> filtered = new ArrayList<>(unaffected);
        for (List<ScoredMemory> group : grouped.values()) {
            if (group.size() <= 1) {
                filtered.addAll(group);
                continue;
            }
            double topScore = group.stream().mapToDouble(ScoredMemory::score).max().orElse(0.0);
            List<ScoredMemory> closeGroup = group.stream()
                    .filter(item -> topScore - item.score() <= 0.05)
                    .toList();
            if (closeGroup.size() <= 1) {
                filtered.addAll(group);
                continue;
            }
            ScoredMemory winner = closeGroup.stream()
                    .max(Comparator.comparing(
                            item -> item.memory().getLastReinforcedAt(),
                            Comparator.nullsFirst(Comparator.naturalOrder())))
                    .orElse(closeGroup.get(0));
            for (ScoredMemory item : group) {
                if (topScore - item.score() > 0.05 || item == winner) {
                    filtered.add(item);
                }
            }
        }
        return filtered;
    }

    private List<AiMemoryContext> trimMemories(List<ScoredMemory> memories, int budgetTokens, int maxCount) {
        List<AiMemoryContext> selected = new ArrayList<>();
        int usedTokens = 0;
        for (ScoredMemory item : memories) {
            if (selected.size() >= maxCount) {
                break;
            }
            int estimate = estimateTokens(item.memory().getContent()) + 8;
            if (!selected.isEmpty() && usedTokens + estimate > budgetTokens) {
                break;
            }
            selected.add(toMemoryContext(item));
            usedTokens += estimate;
        }
        return selected;
    }

    private AiMemoryContext toMemoryContext(ScoredMemory item) {
        return new AiMemoryContext(
                String.valueOf(item.memory().getId()),
                item.memory().getContent(),
                item.memory().getMemoryType(),
                item.memory().getCategory(),
                item.memory().getTemporalScope(),
                item.memory().getConfidence(),
                item.memory().getImportanceScore(),
                item.retention(),
                item.memory().getAlwaysPinned() != null && item.memory().getAlwaysPinned() == 1);
    }

    private List<UserMemory> listActiveMemories(Long userId, String memoryType) {
        LambdaQueryWrapper<UserMemory> query = new LambdaQueryWrapper<UserMemory>()
                .eq(UserMemory::getUserId, userId)
                .eq(UserMemory::getStatus, MEMORY_STATUS_ACTIVE)
                .orderByDesc(UserMemory::getAlwaysPinned)
                .orderByDesc(UserMemory::getImportanceScore)
                .orderByDesc(UserMemory::getUpdatedAt)
                .orderByDesc(UserMemory::getId);
        if (StringUtils.hasText(memoryType)) {
            query.eq(UserMemory::getMemoryType, memoryType);
        }
        return new ArrayList<>(userMemoryMapper.selectList(query));
    }

    private double scoreShortMemory(UserMemory memory, String latestUserMessage, double retention) {
        double similarity = MemoryContentMatcher.similarity(memory.getContent(), latestUserMessage);
        double recency = computeRecency(memory.getLastReinforcedAt());
        return similarity * 0.55 + retention * 0.30 + recency * 0.15;
    }

    private double calculateRetention(UserMemory memory) {
        double strength = safeScore(memory.getStrengthScore(), 0.7);
        if (memory.getHalfLifeHours() == null || memory.getHalfLifeHours() <= 0 || memory.getLastReinforcedAt() == null) {
            return strength;
        }
        long hours = Math.max(0L, Duration.between(memory.getLastReinforcedAt(), LocalDateTime.now()).toHours());
        double retention = strength * Math.pow(0.5, (double) hours / memory.getHalfLifeHours());
        return Math.max(0.0, Math.min(1.0, retention));
    }

    private double computeRecency(LocalDateTime lastReinforcedAt) {
        if (lastReinforcedAt == null) {
            return 0.0;
        }
        long hours = Math.max(0L, Duration.between(lastReinforcedAt, LocalDateTime.now()).toHours());
        if (hours <= 24) {
            return 1.0;
        }
        if (hours >= 24L * 30) {
            return 0.0;
        }
        return 1.0 - (hours / (24.0 * 30));
    }

    private void archiveMemory(UserMemory memory) {
        memory.setStatus(MEMORY_STATUS_ARCHIVED);
        memory.setUpdatedAt(LocalDateTime.now());
        userMemoryMapper.updateById(memory);
    }

    private String normalizeCategory(String category) {
        return category == null ? null : category.trim().toLowerCase(Locale.ROOT);
    }

    private double safeScore(Double value, double fallback) {
        return value == null ? fallback : Math.max(0.0, Math.min(1.0, value));
    }

    private int estimateTokens(String text) {
        if (!StringUtils.hasText(text)) {
            return 0;
        }
        int length = text.codePointCount(0, text.length());
        return Math.max(1, length / 2);
    }
}
