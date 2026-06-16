package com.tsukimiai.hoshi.conversation.application.proactive;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.tsukimiai.hoshi.ai.model.AiChatContext;
import com.tsukimiai.hoshi.ai.model.AiMemoryContext;
import com.tsukimiai.hoshi.conversation.application.ChatContextAssembler;
import com.tsukimiai.hoshi.conversation.application.ChatMessagePersistenceService;
import com.tsukimiai.hoshi.conversation.application.SessionSummaryCodec;
import com.tsukimiai.hoshi.conversation.entity.ChatMessage;
import com.tsukimiai.hoshi.conversation.entity.ChatMessageRole;
import com.tsukimiai.hoshi.conversation.entity.ChatSession;
import com.tsukimiai.hoshi.conversation.entity.ProactiveSourceType;
import com.tsukimiai.hoshi.conversation.entity.UserMemory;
import com.tsukimiai.hoshi.conversation.mapper.ChatMessageMapper;
import com.tsukimiai.hoshi.conversation.mapper.ChatSessionMapper;
import com.tsukimiai.hoshi.conversation.mapper.UserMemoryMapper;

@Component
public class ProactiveCandidateSelector {

    private static final String MEMORY_STATUS_ACTIVE = "active";
    private static final Set<String> ELIGIBLE_CATEGORIES = Set.of(
            "plan",
            "temporary_goal",
            "current_focus",
            "recent_event",
            "mood");

    private static final Map<String, Double> CATEGORY_PRIORITY = Map.of(
            "temporary_goal", 1.0,
            "plan", 0.95,
            "current_focus", 0.9,
            "recent_event", 0.85,
            "mood", 0.75);

    private final UserMemoryMapper userMemoryMapper;
    private final ChatSessionMapper chatSessionMapper;
    private final ChatMessageMapper chatMessageMapper;
    private final SessionSummaryCodec sessionSummaryCodec;
    private final ChatContextAssembler chatContextAssembler;
    private final ChatMessagePersistenceService persistenceService;

    public ProactiveCandidateSelector(
            UserMemoryMapper userMemoryMapper,
            ChatSessionMapper chatSessionMapper,
            ChatMessageMapper chatMessageMapper,
            SessionSummaryCodec sessionSummaryCodec,
            ChatContextAssembler chatContextAssembler,
            ChatMessagePersistenceService persistenceService) {
        this.userMemoryMapper = userMemoryMapper;
        this.chatSessionMapper = chatSessionMapper;
        this.chatMessageMapper = chatMessageMapper;
        this.sessionSummaryCodec = sessionSummaryCodec;
        this.chatContextAssembler = chatContextAssembler;
        this.persistenceService = persistenceService;
    }

    public List<Long> listCandidateUserIds(int limit) {
        return userMemoryMapper.selectList(new LambdaQueryWrapper<UserMemory>()
                        .select(UserMemory::getUserId)
                        .eq(UserMemory::getStatus, MEMORY_STATUS_ACTIVE)
                        .in(UserMemory::getCategory, ELIGIBLE_CATEGORIES)
                        .orderByDesc(UserMemory::getUpdatedAt))
                .stream()
                .map(UserMemory::getUserId)
                .distinct()
                .limit(limit)
                .toList();
    }

    public List<ProactiveCandidate> selectCandidates(Long userId) {
        ChatSession session = resolveTargetSession(userId);
        if (session == null) {
            return List.of();
        }

        List<ProactiveCandidate> candidates = new ArrayList<>();
        List<ChatMessage> messages = persistenceService.listRecentMessages(session.getId(), Integer.MAX_VALUE);
        AiChatContext context = chatContextAssembler.buildChatContext(userId, session, messages);
        List<AiMemoryContext> shortMemories = context.shortMemories();
        int size = shortMemories.size();
        for (int index = 0; index < size; index++) {
            AiMemoryContext memory = shortMemories.get(index);
            if (memory == null || !StringUtils.hasText(memory.content())) {
                continue;
            }
            if (!ELIGIBLE_CATEGORIES.contains(normalizeCategory(memory.category()))) {
                continue;
            }
            double priority = rankPriority(memory, index, size);
            candidates.add(new ProactiveCandidate(
                    userId,
                    session.getId(),
                    ProactiveSourceType.MEMORY,
                    "memory:" + memory.id(),
                    memory.content().trim(),
                    priority,
                    memory.category()));
        }

        var summary = sessionSummaryCodec.hydrateSessionSummary(session);
        if (summary != null && summary.openLoops() != null) {
            int openLoopIndex = 0;
            for (String openLoop : summary.openLoops()) {
                if (!StringUtils.hasText(openLoop)) {
                    continue;
                }
                candidates.add(new ProactiveCandidate(
                        userId,
                        session.getId(),
                        ProactiveSourceType.OPEN_LOOP,
                        "open_loop:" + session.getId() + ":" + openLoopIndex,
                        openLoop.trim(),
                        0.8,
                        null));
                openLoopIndex++;
            }
        }

        candidates.sort(Comparator.comparingDouble(ProactiveCandidate::priority).reversed());
        return candidates;
    }

    public LocalDateTime findLastUserMessageAt(Long sessionId) {
        ChatMessage message = chatMessageMapper.selectOne(new LambdaQueryWrapper<ChatMessage>()
                .eq(ChatMessage::getSessionId, sessionId)
                .eq(ChatMessage::getRole, ChatMessageRole.USER.getValue())
                .orderByDesc(ChatMessage::getCreatedAt)
                .orderByDesc(ChatMessage::getId)
                .last("LIMIT 1"));
        return message == null ? null : message.getCreatedAt();
    }

    private double rankPriority(AiMemoryContext memory, int index, int size) {
        double categoryPriority = CATEGORY_PRIORITY.getOrDefault(normalizeCategory(memory.category()), 0.7);
        double rankBoost = size <= 0 ? 0.0 : ((double) (size - index) / size) * 0.3;
        double importanceBoost = memory.importance() == null ? 0.0 : Math.min(0.2, memory.importance() * 0.2);
        return categoryPriority + rankBoost + importanceBoost;
    }

    private String normalizeCategory(String category) {
        return category == null ? "" : category.trim().toLowerCase();
    }

    private ChatSession resolveTargetSession(Long userId) {
        List<ChatSession> sessions = chatSessionMapper.selectList(new LambdaQueryWrapper<ChatSession>()
                .eq(ChatSession::getUserId, userId)
                .orderByDesc(ChatSession::getUpdatedAt)
                .orderByDesc(ChatSession::getId)
                .last("LIMIT 1"));
        return sessions.isEmpty() ? null : sessions.get(0);
    }
}
