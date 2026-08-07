package com.tsukimiai.hoshi.conversation.application;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.tsukimiai.hoshi.ai.cognition.AiMemoryCandidate;
import com.tsukimiai.hoshi.ai.cognition.MemoryReconciliationOperation;
import com.tsukimiai.hoshi.conversation.entity.UserMemory;
import com.tsukimiai.hoshi.conversation.mapper.UserMemoryMapper;
import com.tsukimiai.hoshi.conversation.support.MemoryContentMatcher;
import com.tsukimiai.hoshi.conversation.support.retrieval.MemoryVectorIndexer;

@Service
public class MemoryReconciliationService {

    private static final String MEMORY_STATUS_ACTIVE = "active";
    private static final String MEMORY_STATUS_ARCHIVED = "archived";
    private static final double TARGET_HINT_THRESHOLD = 0.65;
    private static final double RECENTLY_ARCHIVED_SKIP_THRESHOLD = 0.72;

    private final UserMemoryMapper userMemoryMapper;
    private final MemoryVectorIndexer memoryVectorIndexer;

    public MemoryReconciliationService(UserMemoryMapper userMemoryMapper, MemoryVectorIndexer memoryVectorIndexer) {
        this.userMemoryMapper = userMemoryMapper;
        this.memoryVectorIndexer = memoryVectorIndexer;
    }

    public void archiveByStaleHints(Long userId, List<String> hints) {
        if (hints == null || hints.isEmpty()) {
            return;
        }
        List<UserMemory> active = listActiveMemories(userId);
        for (String hint : hints) {
            if (!StringUtils.hasText(hint)) {
                continue;
            }
            UserMemory target = MemoryContentMatcher.findBestMatchByHint(
                    active, hint, MemoryContentMatcher.STALE_HINT_SIMILARITY_THRESHOLD);
            if (target != null) {
                archiveMemory(target);
                active.removeIf(memory -> memory.getId().equals(target.getId()));
            }
        }
    }

    public UserMemory resolveTargetMemory(Long userId, List<UserMemory> existing, AiMemoryCandidate candidate) {
        if (candidate == null) {
            return null;
        }
        UserMemory byId = findActiveMemoryById(userId, existing, candidate.supersedesMemoryId());
        if (byId != null) {
            return byId;
        }
        if (existing == null || existing.isEmpty()) {
            return null;
        }
        if (StringUtils.hasText(candidate.supersedesContent())) {
            UserMemory byHint = MemoryContentMatcher.findBestMatchByHint(
                    existing, candidate.supersedesContent(), TARGET_HINT_THRESHOLD);
            if (byHint != null) {
                return byHint;
            }
        }
        return MemoryContentMatcher.findMatchingMemory(
                existing,
                candidate.memoryType(),
                candidate.category(),
                StringUtils.hasText(candidate.content()) ? candidate.content() : candidate.supersedesContent());
    }

    public UserMemory resolveTargetMemory(List<UserMemory> existing, AiMemoryCandidate candidate) {
        if (existing == null || existing.isEmpty() || candidate == null) {
            return null;
        }
        Long userId = existing.get(0).getUserId();
        return resolveTargetMemory(userId, existing, candidate);
    }

    public int applyReconciliationOperations(
            Long userId,
            Long sessionId,
            Long sourceMessageId,
            List<MemoryReconciliationOperation> operations,
            double minConfidence) {
        return applyReconciliationOperations(userId, sessionId, sourceMessageId, operations, minConfidence, List.of());
    }

    public int applyReconciliationOperations(
            Long userId,
            Long sessionId,
            Long sourceMessageId,
            List<MemoryReconciliationOperation> operations,
            double minConfidence,
            List<String> recentArchivedHints) {
        if (operations == null || operations.isEmpty()) {
            return 0;
        }
        List<UserMemory> existing = listActiveMemories(userId);
        int applied = 0;
        for (MemoryReconciliationOperation operation : operations) {
            if (operation == null) {
                continue;
            }
            if (operation.confidence() != null && operation.confidence() < minConfidence) {
                continue;
            }
            if (shouldSkipRecentlyArchived(operation.targetContent(), recentArchivedHints)) {
                continue;
            }
            String action = normalizeAction(operation.action());
            if ("archive".equals(action)) {
                UserMemory target = resolveOperationTarget(userId, existing, operation);
                if (target != null) {
                    archiveMemory(target);
                    existing.removeIf(memory -> memory.getId().equals(target.getId()));
                    applied++;
                }
                continue;
            }
            if ("supersede".equals(action)) {
                UserMemory target = resolveOperationTarget(userId, existing, operation);
                Long supersededId = target == null ? null : target.getId();
                if (target != null) {
                    archiveMemory(target);
                    existing.removeIf(memory -> memory.getId().equals(target.getId()));
                }
                if (StringUtils.hasText(operation.newContent())) {
                    UserMemory created = insertMemoryFromOperation(
                            userId, sessionId, sourceMessageId, operation, supersededId);
                    existing.add(created);
                    applied++;
                }
            }
        }
        return applied;
    }

    public void archiveMemory(UserMemory memory) {
        if (memory == null || MEMORY_STATUS_ARCHIVED.equalsIgnoreCase(memory.getStatus())) {
            return;
        }
        memory.setStatus(MEMORY_STATUS_ARCHIVED);
        memory.setUpdatedAt(LocalDateTime.now());
        userMemoryMapper.updateById(memory);
        memoryVectorIndexer.deleteMemory(memory.getUserId(), memory.getId());
    }

    public List<UserMemory> listActiveMemories(Long userId) {
        return new ArrayList<>(userMemoryMapper.selectList(new LambdaQueryWrapper<UserMemory>()
                .eq(UserMemory::getUserId, userId)
                .eq(UserMemory::getStatus, MEMORY_STATUS_ACTIVE)
                .orderByDesc(UserMemory::getUpdatedAt)
                .orderByDesc(UserMemory::getId)));
    }

    public long countArchivedSince(Long userId, LocalDateTime since) {
        return userMemoryMapper.selectCount(new LambdaQueryWrapper<UserMemory>()
                .eq(UserMemory::getUserId, userId)
                .eq(UserMemory::getStatus, MEMORY_STATUS_ARCHIVED)
                .ge(UserMemory::getUpdatedAt, since));
    }

    public List<String> listRecentArchivedContents(Long userId, LocalDateTime since, int limit) {
        return userMemoryMapper.selectList(new LambdaQueryWrapper<UserMemory>()
                        .eq(UserMemory::getUserId, userId)
                        .eq(UserMemory::getStatus, MEMORY_STATUS_ARCHIVED)
                        .ge(UserMemory::getUpdatedAt, since)
                        .orderByDesc(UserMemory::getUpdatedAt)
                        .last("LIMIT " + Math.max(1, limit)))
                .stream()
                .map(UserMemory::getContent)
                .filter(StringUtils::hasText)
                .map(String::trim)
                .toList();
    }

    public List<Long> listCandidateUserIds(int limit) {
        return userMemoryMapper.selectList(new LambdaQueryWrapper<UserMemory>()
                        .select(UserMemory::getUserId)
                        .eq(UserMemory::getStatus, MEMORY_STATUS_ACTIVE)
                        .orderByDesc(UserMemory::getUpdatedAt))
                .stream()
                .map(UserMemory::getUserId)
                .distinct()
                .limit(limit)
                .toList();
    }

    public static String formatActiveMemoryLine(UserMemory memory) {
        if (memory == null || !StringUtils.hasText(memory.getContent())) {
            return "";
        }
        return "- [id=" + memory.getId() + "] [" + memory.getCategory() + "] " + memory.getContent().trim();
    }

    private UserMemory resolveOperationTarget(
            Long userId,
            List<UserMemory> existing,
            MemoryReconciliationOperation operation) {
        UserMemory byId = findActiveMemoryById(userId, existing, operation.targetMemoryId());
        if (byId != null) {
            return byId;
        }
        return MemoryContentMatcher.findBestMatchByHint(
                existing, operation.targetContent(), TARGET_HINT_THRESHOLD);
    }

    private UserMemory findActiveMemoryById(Long userId, List<UserMemory> existing, Long memoryId) {
        if (memoryId == null || memoryId <= 0) {
            return null;
        }
        if (existing != null) {
            for (UserMemory memory : existing) {
                if (memoryId.equals(memory.getId())
                        && MEMORY_STATUS_ACTIVE.equalsIgnoreCase(memory.getStatus())
                        && userId.equals(memory.getUserId())) {
                    return memory;
                }
            }
        }
        UserMemory loaded = userMemoryMapper.selectById(memoryId);
        if (loaded == null
                || !userId.equals(loaded.getUserId())
                || !MEMORY_STATUS_ACTIVE.equalsIgnoreCase(loaded.getStatus())) {
            return null;
        }
        return loaded;
    }

    private boolean shouldSkipRecentlyArchived(String targetContent, List<String> recentArchivedHints) {
        if (!StringUtils.hasText(targetContent) || recentArchivedHints == null || recentArchivedHints.isEmpty()) {
            return false;
        }
        for (String hint : recentArchivedHints) {
            if (!StringUtils.hasText(hint)) {
                continue;
            }
            if (MemoryContentMatcher.similarity(targetContent, hint) >= RECENTLY_ARCHIVED_SKIP_THRESHOLD) {
                return true;
            }
        }
        return false;
    }

    private UserMemory insertMemoryFromOperation(
            Long userId,
            Long sessionId,
            Long sourceMessageId,
            MemoryReconciliationOperation operation,
            Long supersedesMemoryId) {
        UserMemory memory = new UserMemory();
        LocalDateTime now = LocalDateTime.now();
        String memoryType = normalizeToken(operation.memoryType());
        if (!StringUtils.hasText(memoryType)) {
            memoryType = "short";
        }
        memory.setUserId(userId);
        memory.setMemoryType(memoryType);
        memory.setCategory(normalizeToken(operation.category()));
        memory.setContent(operation.newContent().trim());
        memory.setTemporalScope("recent");
        memory.setConfidence(0.85);
        memory.setImportanceScore(0.7);
        memory.setStrengthScore("short".equals(memoryType) ? 0.8 : 1.0);
        memory.setHalfLifeHours("short".equals(memoryType) ? 72 : null);
        memory.setAccessCount(1);
        memory.setAlwaysPinned(0);
        memory.setStatus(MEMORY_STATUS_ACTIVE);
        memory.setSourceSessionId(sessionId);
        memory.setSourceMessageId(sourceMessageId);
        memory.setSupersedesMemoryId(supersedesMemoryId);
        memory.setLastReinforcedAt(now);
        memory.setCreatedAt(now);
        memory.setUpdatedAt(now);
        userMemoryMapper.insert(memory);
        return memory;
    }

    private String normalizeAction(String action) {
        return action == null ? "create" : action.trim().toLowerCase(Locale.ROOT);
    }

    private String normalizeToken(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }
}
