package com.tsukimiai.hoshi.conversation.service.impl;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.tsukimiai.hoshi.conversation.dto.MemoryCorrectionResponse;
import com.tsukimiai.hoshi.conversation.entity.UserMemory;
import com.tsukimiai.hoshi.conversation.mapper.UserMemoryMapper;
import com.tsukimiai.hoshi.conversation.service.UserMemoryService;
import com.tsukimiai.hoshi.conversation.support.retrieval.MemoryVectorIndexer;
import com.tsukimiai.hoshi.user.entity.User;

@Service
@Transactional(readOnly = true)
public class UserMemoryServiceImpl implements UserMemoryService {

    private static final String MEMORY_TYPE_SHORT = "short";
    private static final String MEMORY_TYPE_LONG = "long";
    private static final String MEMORY_STATUS_ACTIVE = "active";
    private static final String MEMORY_STATUS_ARCHIVED = "archived";
    private static final String MEMORY_STATUS_PROMOTED = "promoted";
    private static final String EVENT_CREATED = "created";
    private static final String EVENT_PROMOTED = "promoted";
    private static final java.time.Duration PROMOTION_WINDOW = java.time.Duration.ofSeconds(5);

    private static final java.util.Set<String> LONG_MEMORY_CATEGORIES = java.util.Set.of(
            "identity", "preference", "habit", "communication_preference", "long_term_goal");
    private static final java.util.Set<String> SHORT_MEMORY_CATEGORIES = java.util.Set.of(
            "plan", "mood", "recent_event", "temporary_goal", "current_focus");

    private final UserMemoryMapper userMemoryMapper;
    private final MemoryVectorIndexer memoryVectorIndexer;

    public UserMemoryServiceImpl(UserMemoryMapper userMemoryMapper, MemoryVectorIndexer memoryVectorIndexer) {
        this.userMemoryMapper = userMemoryMapper;
        this.memoryVectorIndexer = memoryVectorIndexer;
    }

    @Override
    public List<com.tsukimiai.hoshi.conversation.dto.UserMemoryResponse> listMemories(User user, String category) {
        String normalizedCategory = normalizeCategory(category);
        if (org.springframework.util.StringUtils.hasText(normalizedCategory)) {
            validateCategory(normalizedCategory);
            if (SHORT_MEMORY_CATEGORIES.contains(normalizedCategory)) {
                return listShortTermMemories(user.getId(), normalizedCategory);
            }
            return listLongTermMemories(user.getId(), normalizedCategory);
        }
        List<com.tsukimiai.hoshi.conversation.dto.UserMemoryResponse> memories = new ArrayList<>();
        memories.addAll(listLongTermMemories(user.getId(), null));
        memories.addAll(listShortTermMemories(user.getId(), null));
        return memories;
    }

    @Override
    public List<com.tsukimiai.hoshi.conversation.dto.RecentMemoryResponse> listRecentLongTermEvents(
            User user,
            java.time.LocalDateTime since) {
        if (since == null) {
            throw new com.tsukimiai.hoshi.common.exception.BusinessException(
                    com.tsukimiai.hoshi.common.exception.ErrorCode.BAD_REQUEST, "since 参数不能为空");
        }
        LambdaQueryWrapper<UserMemory> query = baseLongTermQuery(user.getId())
                .ge(UserMemory::getCreatedAt, since)
                .orderByAsc(UserMemory::getCreatedAt)
                .orderByAsc(UserMemory::getId);
        return userMemoryMapper.selectList(query).stream()
                .map(memory -> com.tsukimiai.hoshi.conversation.dto.RecentMemoryResponse.from(
                        memory, resolveEventType(user.getId(), memory)))
                .toList();
    }

    @Override
    public List<MemoryCorrectionResponse> listRecentCorrections(User user, int limit, int offset) {
        int effectiveLimit = Math.min(Math.max(limit, 1), 50);
        int effectiveOffset = Math.max(offset, 0);
        int fetchCount = effectiveLimit + effectiveOffset;
        List<UserMemory> superseding = userMemoryMapper.selectList(new LambdaQueryWrapper<UserMemory>()
                .eq(UserMemory::getUserId, user.getId())
                .isNotNull(UserMemory::getSupersedesMemoryId)
                .orderByDesc(UserMemory::getCreatedAt)
                .orderByDesc(UserMemory::getId)
                .last("LIMIT " + fetchCount));

        List<UserMemory> archived = userMemoryMapper.selectList(new LambdaQueryWrapper<UserMemory>()
                .eq(UserMemory::getUserId, user.getId())
                .eq(UserMemory::getStatus, MEMORY_STATUS_ARCHIVED)
                .orderByDesc(UserMemory::getUpdatedAt)
                .orderByDesc(UserMemory::getId)
                .last("LIMIT " + fetchCount));

        Map<Long, UserMemory> lookup = new HashMap<>();
        for (UserMemory memory : superseding) {
            lookup.put(memory.getId(), memory);
        }
        for (UserMemory memory : archived) {
            lookup.putIfAbsent(memory.getId(), memory);
        }
        List<Long> supersededIds = superseding.stream()
                .map(UserMemory::getSupersedesMemoryId)
                .filter(java.util.Objects::nonNull)
                .distinct()
                .toList();
        if (!supersededIds.isEmpty()) {
            userMemoryMapper.selectBatchIds(supersededIds).forEach(memory -> lookup.put(memory.getId(), memory));
        }

        List<MemoryCorrectionResponse> corrections = new ArrayList<>();
        for (UserMemory memory : superseding) {
            UserMemory superseded = lookup.get(memory.getSupersedesMemoryId());
            corrections.add(MemoryCorrectionResponse.supersede(memory, superseded));
        }
        for (UserMemory memory : archived) {
            boolean alreadyCovered = superseding.stream()
                    .anyMatch(item -> memory.getId().equals(item.getSupersedesMemoryId()));
            if (!alreadyCovered) {
                corrections.add(MemoryCorrectionResponse.archive(memory));
            }
        }
        corrections.sort(Comparator.comparing(MemoryCorrectionResponse::occurredAt).reversed());
        return corrections.stream()
                .skip(effectiveOffset)
                .limit(effectiveLimit)
                .toList();
    }

    @Override
    @Transactional
    public com.tsukimiai.hoshi.conversation.dto.UserMemoryResponse createLongTermMemory(
            User user,
            com.tsukimiai.hoshi.conversation.dto.CreateUserMemoryRequest request) {
        String category = normalizeCategory(request.category());
        validateLongTermCategory(category);
        String content = request.content().trim();
        if (!org.springframework.util.StringUtils.hasText(content)) {
            throw new com.tsukimiai.hoshi.common.exception.BusinessException(
                    com.tsukimiai.hoshi.common.exception.ErrorCode.BAD_REQUEST, "记忆内容不能为空");
        }

        List<UserMemory> existing = userMemoryMapper.selectList(baseLongTermQuery(user.getId()));
        UserMemory matched = com.tsukimiai.hoshi.conversation.support.MemoryContentMatcher.findMatchingMemory(
                existing, MEMORY_TYPE_LONG, category, content);
        if (matched != null) {
            matched.setContent(com.tsukimiai.hoshi.conversation.support.MemoryContentMatcher.preferRicherContent(
                    matched.getContent(), content));
            if (Boolean.TRUE.equals(request.alwaysPinned())) {
                matched.setAlwaysPinned(1);
            }
            matched.setLastReinforcedAt(java.time.LocalDateTime.now());
            userMemoryMapper.updateById(matched);
            memoryVectorIndexer.upsertLongMemory(matched);
            return com.tsukimiai.hoshi.conversation.dto.UserMemoryResponse.from(matched);
        }

        java.time.LocalDateTime now = java.time.LocalDateTime.now();
        UserMemory memory = new UserMemory();
        memory.setUserId(user.getId());
        memory.setMemoryType(MEMORY_TYPE_LONG);
        memory.setCategory(category);
        memory.setContent(content);
        memory.setTemporalScope("stable");
        memory.setConfidence(0.9);
        memory.setImportanceScore(0.8);
        memory.setStrengthScore(1.0);
        memory.setHalfLifeHours(null);
        memory.setAccessCount(0);
        memory.setAlwaysPinned(Boolean.TRUE.equals(request.alwaysPinned()) ? 1 : 0);
        memory.setStatus(MEMORY_STATUS_ACTIVE);
        memory.setVectorPointId(null);
        memory.setSourceSessionId(null);
        memory.setSourceMessageId(null);
        memory.setLastReinforcedAt(now);
        memory.setCreatedAt(now);
        memory.setUpdatedAt(now);
        userMemoryMapper.insert(memory);
        memoryVectorIndexer.upsertLongMemory(memory);
        return com.tsukimiai.hoshi.conversation.dto.UserMemoryResponse.from(memory);
    }

    @Override
    @Transactional
    public com.tsukimiai.hoshi.conversation.dto.UserMemoryResponse updateLongTermMemory(
            User user,
            Long memoryId,
            com.tsukimiai.hoshi.conversation.dto.UpdateUserMemoryRequest request) {
        UserMemory memory = getOwnedLongTermMemory(user.getId(), memoryId);
        boolean changed = false;

        if (request.content() != null) {
            String content = request.content().trim();
            if (!org.springframework.util.StringUtils.hasText(content)) {
                throw new com.tsukimiai.hoshi.common.exception.BusinessException(
                        com.tsukimiai.hoshi.common.exception.ErrorCode.BAD_REQUEST, "记忆内容不能为空");
            }
            memory.setContent(content);
            changed = true;
        }
        if (request.category() != null) {
            String category = normalizeCategory(request.category());
            validateLongTermCategory(category);
            memory.setCategory(category);
            changed = true;
        }
        if (request.alwaysPinned() != null) {
            memory.setAlwaysPinned(request.alwaysPinned() ? 1 : 0);
            changed = true;
        }
        if (!changed) {
            throw new com.tsukimiai.hoshi.common.exception.BusinessException(
                    com.tsukimiai.hoshi.common.exception.ErrorCode.BAD_REQUEST, "没有可更新的字段");
        }

        memory.setUpdatedAt(java.time.LocalDateTime.now());
        userMemoryMapper.updateById(memory);
        memoryVectorIndexer.upsertLongMemory(memory);
        return com.tsukimiai.hoshi.conversation.dto.UserMemoryResponse.from(memory);
    }

    @Override
    @Transactional
    public void archiveMemory(User user, Long memoryId) {
        UserMemory memory = getOwnedActiveMemory(user.getId(), memoryId);
        memory.setStatus(MEMORY_STATUS_ARCHIVED);
        memory.setUpdatedAt(java.time.LocalDateTime.now());
        userMemoryMapper.updateById(memory);
        memoryVectorIndexer.deleteMemory(user.getId(), memoryId);
    }

    private List<com.tsukimiai.hoshi.conversation.dto.UserMemoryResponse> listLongTermMemories(
            Long userId,
            String category) {
        LambdaQueryWrapper<UserMemory> query = baseLongTermQuery(userId);
        if (org.springframework.util.StringUtils.hasText(category)) {
            query.eq(UserMemory::getCategory, category);
        }
        query.orderByDesc(UserMemory::getAlwaysPinned)
                .orderByDesc(UserMemory::getCreatedAt)
                .orderByDesc(UserMemory::getId);
        return userMemoryMapper.selectList(query).stream()
                .map(com.tsukimiai.hoshi.conversation.dto.UserMemoryResponse::from)
                .toList();
    }

    private List<com.tsukimiai.hoshi.conversation.dto.UserMemoryResponse> listShortTermMemories(
            Long userId,
            String category) {
        LambdaQueryWrapper<UserMemory> query = baseShortTermQuery(userId);
        if (org.springframework.util.StringUtils.hasText(category)) {
            query.eq(UserMemory::getCategory, category);
        }
        query.orderByDesc(UserMemory::getLastReinforcedAt)
                .orderByDesc(UserMemory::getCreatedAt)
                .orderByDesc(UserMemory::getId);
        return userMemoryMapper.selectList(query).stream()
                .map(com.tsukimiai.hoshi.conversation.dto.UserMemoryResponse::from)
                .toList();
    }

    private LambdaQueryWrapper<UserMemory> baseLongTermQuery(Long userId) {
        return new LambdaQueryWrapper<UserMemory>()
                .eq(UserMemory::getUserId, userId)
                .eq(UserMemory::getMemoryType, MEMORY_TYPE_LONG)
                .eq(UserMemory::getStatus, MEMORY_STATUS_ACTIVE);
    }

    private LambdaQueryWrapper<UserMemory> baseShortTermQuery(Long userId) {
        return new LambdaQueryWrapper<UserMemory>()
                .eq(UserMemory::getUserId, userId)
                .eq(UserMemory::getMemoryType, MEMORY_TYPE_SHORT)
                .eq(UserMemory::getStatus, MEMORY_STATUS_ACTIVE);
    }

    private UserMemory getOwnedLongTermMemory(Long userId, Long memoryId) {
        UserMemory memory = userMemoryMapper.selectById(memoryId);
        if (memory == null
                || !userId.equals(memory.getUserId())
                || !MEMORY_TYPE_LONG.equalsIgnoreCase(memory.getMemoryType())
                || !MEMORY_STATUS_ACTIVE.equalsIgnoreCase(memory.getStatus())) {
            throw new com.tsukimiai.hoshi.common.exception.BusinessException(
                    com.tsukimiai.hoshi.common.exception.ErrorCode.MEMORY_NOT_FOUND);
        }
        return memory;
    }

    private UserMemory getOwnedActiveMemory(Long userId, Long memoryId) {
        UserMemory memory = userMemoryMapper.selectById(memoryId);
        if (memory == null
                || !userId.equals(memory.getUserId())
                || !MEMORY_STATUS_ACTIVE.equalsIgnoreCase(memory.getStatus())) {
            throw new com.tsukimiai.hoshi.common.exception.BusinessException(
                    com.tsukimiai.hoshi.common.exception.ErrorCode.MEMORY_NOT_FOUND);
        }
        String memoryType = memory.getMemoryType() == null ? "" : memory.getMemoryType().trim().toLowerCase(java.util.Locale.ROOT);
        if (!MEMORY_TYPE_LONG.equals(memoryType) && !MEMORY_TYPE_SHORT.equals(memoryType)) {
            throw new com.tsukimiai.hoshi.common.exception.BusinessException(
                    com.tsukimiai.hoshi.common.exception.ErrorCode.MEMORY_NOT_FOUND);
        }
        return memory;
    }

    private String resolveEventType(Long userId, UserMemory memory) {
        if (hasPromotionSource(userId, memory)) {
            return EVENT_PROMOTED;
        }
        return EVENT_CREATED;
    }

    private boolean hasPromotionSource(Long userId, UserMemory memory) {
        if (memory.getCreatedAt() == null || !org.springframework.util.StringUtils.hasText(memory.getContent())) {
            return false;
        }
        java.time.LocalDateTime windowStart = memory.getCreatedAt().minus(PROMOTION_WINDOW);
        java.time.LocalDateTime windowEnd = memory.getCreatedAt().plus(PROMOTION_WINDOW);
        Long count = userMemoryMapper.selectCount(new LambdaQueryWrapper<UserMemory>()
                .eq(UserMemory::getUserId, userId)
                .eq(UserMemory::getContent, memory.getContent())
                .eq(UserMemory::getStatus, MEMORY_STATUS_PROMOTED)
                .ge(UserMemory::getUpdatedAt, windowStart)
                .le(UserMemory::getUpdatedAt, windowEnd));
        return count != null && count > 0;
    }

    private void validateLongTermCategory(String category) {
        if (!LONG_MEMORY_CATEGORIES.contains(category)) {
            throw new com.tsukimiai.hoshi.common.exception.BusinessException(
                    com.tsukimiai.hoshi.common.exception.ErrorCode.BAD_REQUEST, "记忆分类无效");
        }
    }

    private void validateCategory(String category) {
        if (!LONG_MEMORY_CATEGORIES.contains(category) && !SHORT_MEMORY_CATEGORIES.contains(category)) {
            throw new com.tsukimiai.hoshi.common.exception.BusinessException(
                    com.tsukimiai.hoshi.common.exception.ErrorCode.BAD_REQUEST, "记忆分类无效");
        }
    }

    private String normalizeCategory(String category) {
        return category == null ? null : category.trim().toLowerCase(java.util.Locale.ROOT);
    }
}
