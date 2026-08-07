package com.tsukimiai.hoshi.conversation.application;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.tsukimiai.hoshi.ai.cognition.AiCognitionInput;
import com.tsukimiai.hoshi.ai.cognition.AiCognitionResult;
import com.tsukimiai.hoshi.ai.cognition.AiCognitionTask;
import com.tsukimiai.hoshi.ai.cognition.AiCognitionTaskType;
import com.tsukimiai.hoshi.ai.cognition.AiMemoryCandidate;
import com.tsukimiai.hoshi.ai.cognition.MemoryExtractionResult;
import com.tsukimiai.hoshi.ai.config.HoshiAiProperties;
import com.tsukimiai.hoshi.ai.model.AiChatTurn;
import com.tsukimiai.hoshi.ai.model.AiMemoryContext;
import com.tsukimiai.hoshi.ai.service.XingnaiChatService;
import com.tsukimiai.hoshi.conversation.dto.RecentMemoryResponse;
import com.tsukimiai.hoshi.conversation.entity.ChatMessage;
import com.tsukimiai.hoshi.conversation.entity.ChatSession;
import com.tsukimiai.hoshi.conversation.entity.UserMemory;
import com.tsukimiai.hoshi.conversation.mapper.UserMemoryMapper;
import com.tsukimiai.hoshi.conversation.service.ChatSessionService;
import com.tsukimiai.hoshi.conversation.support.MemoryContentMatcher;
import com.tsukimiai.hoshi.conversation.support.retrieval.MemoryRetriever;
import com.tsukimiai.hoshi.conversation.support.retrieval.MemoryVectorIndexer;
import com.tsukimiai.hoshi.conversation.stream.ChatStreamSink;
import com.tsukimiai.hoshi.user.entity.User;

@Service
public class MemoryExtractionWorkflow {

    private static final Logger log = LoggerFactory.getLogger(MemoryExtractionWorkflow.class);
    private static final String MEMORY_STATUS_ACTIVE = "active";
    private static final String MEMORY_STATUS_PROMOTED = "promoted";
    private static final String MEMORY_TYPE_SHORT = "short";
    private static final String MEMORY_TYPE_LONG = "long";
    private static final Set<String> LONG_MEMORY_CATEGORIES = Set.of(
            "identity", "preference", "habit", "communication_preference", "long_term_goal");
    private static final Set<String> SHORT_MEMORY_CATEGORIES = Set.of(
            "plan", "mood", "recent_event", "temporary_goal", "current_focus");

    private final UserMemoryMapper userMemoryMapper;
    private final ChatSessionService chatSessionService;
    private final ChatMessagePersistenceService persistenceService;
    private final XingnaiChatService xingnaiChatService;
    private final HoshiAiProperties hoshiAiProperties;
    private final SessionSummaryCodec sessionSummaryCodec;
    private final MemoryReconciliationService memoryReconciliationService;
    private final MemoryRetriever memoryRetriever;
    private final MemoryVectorIndexer memoryVectorIndexer;

    public MemoryExtractionWorkflow(
            UserMemoryMapper userMemoryMapper,
            ChatSessionService chatSessionService,
            ChatMessagePersistenceService persistenceService,
            XingnaiChatService xingnaiChatService,
            HoshiAiProperties hoshiAiProperties,
            SessionSummaryCodec sessionSummaryCodec,
            MemoryReconciliationService memoryReconciliationService,
            MemoryRetriever memoryRetriever,
            MemoryVectorIndexer memoryVectorIndexer) {
        this.userMemoryMapper = userMemoryMapper;
        this.chatSessionService = chatSessionService;
        this.persistenceService = persistenceService;
        this.xingnaiChatService = xingnaiChatService;
        this.hoshiAiProperties = hoshiAiProperties;
        this.sessionSummaryCodec = sessionSummaryCodec;
        this.memoryReconciliationService = memoryReconciliationService;
        this.memoryRetriever = memoryRetriever;
        this.memoryVectorIndexer = memoryVectorIndexer;
    }

    public void runMemoryExtraction(User user, Long sessionId, ChatMessage assistantMessage, ChatStreamSink sink) {
        List<ChatMessage> messages = persistenceService.listRecentMessages(sessionId, Integer.MAX_VALUE);
        int messageLimit = hoshiAiProperties.getMemoryExtractionMessageLimit();
        List<AiChatTurn> recentTurns = selectLatestTurns(messages, messageLimit);
        if (recentTurns.isEmpty()) {
            return;
        }
        ChatSession session = chatSessionService.get(user, sessionId);
        AiCognitionTask task = new AiCognitionTask(
                null,
                AiCognitionTaskType.MEMORY_EXTRACTION,
                sessionId,
                user.getId(),
                "assistant_reply_persisted",
                new AiCognitionInput(
                        recentTurns,
                        sessionSummaryCodec.hydrateSessionSummary(session),
                        Map.of("messageId", assistantMessage.getId())));
        AiCognitionResult result = xingnaiChatService.runCognitionTask(task);
        if (!(result.result() instanceof MemoryExtractionResult payload)) {
            return;
        }
        List<RecentMemoryResponse> notifications = applyMemoryCandidates(
                user.getId(),
                sessionId,
                assistantMessage.getId(),
                payload.memories());
        if (sink == null || notifications.isEmpty()) {
            return;
        }
        try {
            sink.emit("memory", notifications);
        } catch (IOException ignored) {
            // Client disconnected after done.
        }
    }

    public List<AiMemoryContext> selectShortMemories(Long userId, String latestUserMessage, int budgetTokens) {
        return memoryRetriever.retrieveShort(userId, latestUserMessage, budgetTokens);
    }

    public List<AiMemoryContext> selectLongMemories(Long userId, String latestUserMessage, int budgetTokens) {
        return memoryRetriever.retrieveLong(userId, latestUserMessage, budgetTokens);
    }

    public void reinforceRetrievedMemories(List<AiMemoryContext> shortMemories, List<AiMemoryContext> longMemories) {
        List<String> ids = new ArrayList<>();
        shortMemories.forEach(memory -> ids.add(memory.id()));
        longMemories.forEach(memory -> ids.add(memory.id()));
        if (ids.isEmpty()) {
            return;
        }
        List<UserMemory> memories = userMemoryMapper.selectBatchIds(ids.stream().map(Long::parseLong).toList());
        LocalDateTime now = LocalDateTime.now();
        for (UserMemory memory : memories) {
            memory.setLastReinforcedAt(now);
            memory.setAccessCount((memory.getAccessCount() == null ? 0 : memory.getAccessCount()) + 1);
            if (memory.getStrengthScore() != null) {
                memory.setStrengthScore(Math.min(1.0, memory.getStrengthScore() + 0.05));
            }
            userMemoryMapper.updateById(memory);
        }
    }

    private List<RecentMemoryResponse> applyMemoryCandidates(
            Long userId,
            Long sessionId,
            Long sourceMessageId,
            List<AiMemoryCandidate> candidates) {
        if (candidates == null || candidates.isEmpty()) {
            return List.of();
        }
        List<RecentMemoryResponse> notifications = new ArrayList<>();
        List<UserMemory> existing = listActiveMemories(userId, null);
        for (AiMemoryCandidate candidate : candidates) {
            if (!shouldPersistCandidate(candidate)) {
                continue;
            }
            String action = candidate.normalizedAction();
            switch (action) {
                case "archive" -> archiveCandidateTarget(userId, existing, candidate);
                case "supersede" -> notifications.addAll(
                        applySupersede(userId, sessionId, sourceMessageId, existing, candidate));
                case "reinforce" -> notifications.addAll(
                        applyReinforceOrCreate(userId, sessionId, sourceMessageId, existing, candidate));
                default -> notifications.addAll(
                        applyCreateOrReinforce(userId, sessionId, sourceMessageId, existing, candidate));
            }
        }
        return notifications;
    }

    private void archiveCandidateTarget(Long userId, List<UserMemory> existing, AiMemoryCandidate candidate) {
        UserMemory target = memoryReconciliationService.resolveTargetMemory(userId, existing, candidate);
        if (target != null) {
            memoryReconciliationService.archiveMemory(target);
            existing.removeIf(memory -> memory.getId().equals(target.getId()));
        }
    }

    private List<RecentMemoryResponse> applySupersede(
            Long userId,
            Long sessionId,
            Long sourceMessageId,
            List<UserMemory> existing,
            AiMemoryCandidate candidate) {
        UserMemory target = memoryReconciliationService.resolveTargetMemory(userId, existing, candidate);
        Long supersededId = null;
        if (target != null) {
            supersededId = target.getId();
            memoryReconciliationService.archiveMemory(target);
            existing.removeIf(memory -> memory.getId().equals(target.getId()));
        }
        if (!StringUtils.hasText(candidate.content())) {
            return List.of();
        }
        UserMemory created = insertCandidateMemory(userId, sessionId, sourceMessageId, candidate, supersededId);
        existing.add(created);
        List<RecentMemoryResponse> notifications = new ArrayList<>();
        if (MEMORY_TYPE_LONG.equalsIgnoreCase(created.getMemoryType())) {
            notifications.add(RecentMemoryResponse.from(created, "created"));
        }
        return notifications;
    }

    private List<RecentMemoryResponse> applyReinforceOrCreate(
            Long userId,
            Long sessionId,
            Long sourceMessageId,
            List<UserMemory> existing,
            AiMemoryCandidate candidate) {
        UserMemory matched = memoryReconciliationService.resolveTargetMemory(userId, existing, candidate);
        if (matched == null) {
            matched = findMatchingMemory(existing, candidate);
        }
        if (matched != null) {
            return reinforceAndMaybePromote(userId, sessionId, existing, candidate, matched);
        }
        return applyCreate(userId, sessionId, sourceMessageId, existing, candidate);
    }

    private List<RecentMemoryResponse> applyCreateOrReinforce(
            Long userId,
            Long sessionId,
            Long sourceMessageId,
            List<UserMemory> existing,
            AiMemoryCandidate candidate) {
        UserMemory matched = findMatchingMemory(existing, candidate);
        if (matched != null) {
            return reinforceAndMaybePromote(userId, sessionId, existing, candidate, matched);
        }
        return applyCreate(userId, sessionId, sourceMessageId, existing, candidate);
    }

    private List<RecentMemoryResponse> reinforceAndMaybePromote(
            Long userId,
            Long sessionId,
            List<UserMemory> existing,
            AiMemoryCandidate candidate,
            UserMemory matched) {
        List<RecentMemoryResponse> notifications = new ArrayList<>();
        reinforceExistingMemory(matched, candidate);
        UserMemory promoted = maybePromoteMemory(userId, sessionId, matched, candidate);
        if (promoted != null) {
            notifications.add(RecentMemoryResponse.from(promoted, "promoted"));
        }
        return notifications;
    }

    private List<RecentMemoryResponse> applyCreate(
            Long userId,
            Long sessionId,
            Long sourceMessageId,
            List<UserMemory> existing,
            AiMemoryCandidate candidate) {
        UserMemory memory = insertCandidateMemory(userId, sessionId, sourceMessageId, candidate, null);
        existing.add(memory);
        List<RecentMemoryResponse> notifications = new ArrayList<>();
        if (MEMORY_TYPE_LONG.equalsIgnoreCase(memory.getMemoryType())) {
            notifications.add(RecentMemoryResponse.from(memory, "created"));
        }
        return notifications;
    }

    private UserMemory insertCandidateMemory(
            Long userId,
            Long sessionId,
            Long sourceMessageId,
            AiMemoryCandidate candidate,
            Long supersedesMemoryId) {
        UserMemory memory = new UserMemory();
        LocalDateTime now = LocalDateTime.now();
        memory.setUserId(userId);
        memory.setMemoryType(normalizeMemoryType(candidate.memoryType()));
        memory.setCategory(normalizeCategory(candidate.category()));
        memory.setContent(candidate.content().trim());
        memory.setTemporalScope(normalizeTemporalScope(candidate.temporalScope()));
        memory.setConfidence(safeScore(candidate.confidence(), 0.8));
        memory.setImportanceScore(safeScore(candidate.importance(), 0.6));
        memory.setStrengthScore(MEMORY_TYPE_SHORT.equalsIgnoreCase(memory.getMemoryType())
                ? Math.max(0.7, safeScore(candidate.importance(), 0.7))
                : 1.0);
        memory.setHalfLifeHours(MEMORY_TYPE_SHORT.equalsIgnoreCase(memory.getMemoryType())
                ? hoshiAiProperties.resolveHalfLifeHours(memory.getCategory())
                : null);
        memory.setAccessCount(1);
        memory.setAlwaysPinned(shouldAlwaysPin(memory) ? 1 : 0);
        memory.setStatus(MEMORY_STATUS_ACTIVE);
        memory.setVectorPointId(null);
        memory.setSourceSessionId(sessionId);
        memory.setSourceMessageId(sourceMessageId);
        memory.setSupersedesMemoryId(supersedesMemoryId);
        memory.setLastReinforcedAt(now);
        memory.setCreatedAt(now);
        memory.setUpdatedAt(now);
        userMemoryMapper.insert(memory);
        memoryVectorIndexer.upsertLongMemory(memory);
        return memory;
    }

    private List<AiChatTurn> selectLatestTurns(List<ChatMessage> messages, int messageLimit) {
        int fromIndex = Math.max(0, messages.size() - messageLimit);
        return messages.subList(fromIndex, messages.size())
                .stream()
                .map(message -> new AiChatTurn(message.getRole(), message.getContent()))
                .toList();
    }

    private boolean shouldPersistCandidate(AiMemoryCandidate candidate) {
        if (candidate == null) {
            return false;
        }
        String action = candidate.normalizedAction();
        if ("archive".equals(action)) {
            if (!StringUtils.hasText(candidate.supersedesContent()) && !StringUtils.hasText(candidate.content())) {
                return false;
            }
            double confidence = safeScore(candidate.confidence(), 0.0);
            return confidence >= hoshiAiProperties.getMemoryConfidenceThreshold();
        }
        if (!StringUtils.hasText(candidate.content())) {
            return false;
        }
        String memoryType = normalizeMemoryType(candidate.memoryType());
        String category = normalizeCategory(candidate.category());
        if (!StringUtils.hasText(memoryType) || !StringUtils.hasText(category)) {
            return false;
        }
        if ("discard".equalsIgnoreCase(memoryType)) {
            return false;
        }
        double confidence = safeScore(candidate.confidence(), 0.0);
        if (confidence < hoshiAiProperties.getMemoryConfidenceThreshold()) {
            return false;
        }
        double importance = safeScore(candidate.importance(), 0.0);
        if (MEMORY_TYPE_SHORT.equalsIgnoreCase(memoryType)
                && importance < hoshiAiProperties.getShortMemoryImportanceThreshold()) {
            return false;
        }
        return matchesMemoryTypeAndCategory(memoryType, category);
    }

    private UserMemory maybePromoteMemory(Long userId, Long sessionId, UserMemory existing, AiMemoryCandidate candidate) {
        if (!MEMORY_TYPE_SHORT.equalsIgnoreCase(existing.getMemoryType())) {
            return null;
        }
        if (existing.getAccessCount() < hoshiAiProperties.getShortMemoryPromotionAccessCount()) {
            return null;
        }
        String promotedCategory = switch (normalizeCategory(existing.getCategory())) {
            case "temporary_goal" -> "long_term_goal";
            case "current_focus" -> "preference";
            default -> null;
        };
        if (!StringUtils.hasText(promotedCategory)) {
            return null;
        }
        if (!"stable".equalsIgnoreCase(normalizeTemporalScope(candidate.temporalScope()))
                && !"ongoing".equalsIgnoreCase(normalizeTemporalScope(candidate.temporalScope()))) {
            return null;
        }
        UserMemory promoted = new UserMemory();
        LocalDateTime now = LocalDateTime.now();
        promoted.setUserId(userId);
        promoted.setMemoryType(MEMORY_TYPE_LONG);
        promoted.setCategory(promotedCategory);
        promoted.setContent(existing.getContent());
        promoted.setTemporalScope("stable");
        promoted.setConfidence(Math.max(safeScore(existing.getConfidence(), 0.8), safeScore(candidate.confidence(), 0.8)));
        promoted.setImportanceScore(Math.max(safeScore(existing.getImportanceScore(), 0.7), safeScore(candidate.importance(), 0.7)));
        promoted.setStrengthScore(1.0);
        promoted.setHalfLifeHours(null);
        promoted.setAccessCount(existing.getAccessCount());
        promoted.setAlwaysPinned(shouldAlwaysPin(promoted) ? 1 : 0);
        promoted.setStatus(MEMORY_STATUS_ACTIVE);
        promoted.setSourceSessionId(sessionId);
        promoted.setSourceMessageId(existing.getSourceMessageId());
        promoted.setLastReinforcedAt(now);
        promoted.setCreatedAt(now);
        promoted.setUpdatedAt(now);
        userMemoryMapper.insert(promoted);
        memoryVectorIndexer.upsertLongMemory(promoted);
        existing.setStatus(MEMORY_STATUS_PROMOTED);
        existing.setUpdatedAt(now);
        userMemoryMapper.updateById(existing);
        return promoted;
    }

    private void reinforceExistingMemory(UserMemory existing, AiMemoryCandidate candidate) {
        LocalDateTime now = LocalDateTime.now();
        if (StringUtils.hasText(candidate.content())) {
            existing.setContent(candidate.content().trim());
        }
        existing.setLastReinforcedAt(now);
        existing.setAccessCount((existing.getAccessCount() == null ? 0 : existing.getAccessCount()) + 1);
        existing.setConfidence(Math.max(safeScore(existing.getConfidence(), 0.0), safeScore(candidate.confidence(), 0.0)));
        existing.setImportanceScore(Math.max(safeScore(existing.getImportanceScore(), 0.0), safeScore(candidate.importance(), 0.0)));
        if (existing.getStrengthScore() != null) {
            existing.setStrengthScore(Math.min(1.0, existing.getStrengthScore() + 0.1));
        }
        userMemoryMapper.updateById(existing);
        memoryVectorIndexer.upsertLongMemory(existing);
    }

    private UserMemory findMatchingMemory(List<UserMemory> existing, AiMemoryCandidate candidate) {
        return MemoryContentMatcher.findMatchingMemory(
                existing,
                normalizeMemoryType(candidate.memoryType()),
                normalizeCategory(candidate.category()),
                candidate.content());
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

    private String normalizeMemoryType(String memoryType) {
        return memoryType == null ? null : memoryType.trim().toLowerCase(Locale.ROOT);
    }

    private String normalizeCategory(String category) {
        return category == null ? null : category.trim().toLowerCase(Locale.ROOT);
    }

    private String normalizeTemporalScope(String temporalScope) {
        return temporalScope == null ? null : temporalScope.trim().toLowerCase(Locale.ROOT);
    }

    private boolean matchesMemoryTypeAndCategory(String memoryType, String category) {
        if (MEMORY_TYPE_SHORT.equalsIgnoreCase(memoryType)) {
            return SHORT_MEMORY_CATEGORIES.contains(category);
        }
        if (MEMORY_TYPE_LONG.equalsIgnoreCase(memoryType)) {
            return LONG_MEMORY_CATEGORIES.contains(category);
        }
        return false;
    }

    private boolean shouldAlwaysPin(UserMemory memory) {
        return MEMORY_TYPE_LONG.equalsIgnoreCase(memory.getMemoryType())
                && safeScore(memory.getImportanceScore(), 0.0) >= hoshiAiProperties.getLongPinnedImportanceThreshold();
    }

    private double safeScore(Double value, double fallback) {
        return value == null ? fallback : Math.max(0.0, Math.min(1.0, value));
    }
}
