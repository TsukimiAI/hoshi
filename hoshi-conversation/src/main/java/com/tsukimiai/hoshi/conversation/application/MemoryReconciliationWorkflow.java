package com.tsukimiai.hoshi.conversation.application;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
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
import com.tsukimiai.hoshi.ai.cognition.MemoryReconciliationResult;
import com.tsukimiai.hoshi.ai.config.HoshiAiProperties;
import com.tsukimiai.hoshi.ai.model.AiChatTurn;
import com.tsukimiai.hoshi.ai.model.AiPromptBudget;
import com.tsukimiai.hoshi.ai.model.AiSessionSummary;
import com.tsukimiai.hoshi.ai.service.XingnaiChatService;
import com.tsukimiai.hoshi.conversation.config.MemoryReconciliationProperties;
import com.tsukimiai.hoshi.conversation.entity.ChatMessage;
import com.tsukimiai.hoshi.conversation.entity.ChatSession;
import com.tsukimiai.hoshi.conversation.entity.UserMemory;
import com.tsukimiai.hoshi.conversation.mapper.ChatSessionMapper;
import com.tsukimiai.hoshi.conversation.support.RecentWindow;

@Service
public class MemoryReconciliationWorkflow {

    private static final Logger log = LoggerFactory.getLogger(MemoryReconciliationWorkflow.class);

    private final MemoryReconciliationProperties properties;
    private final MemoryReconciliationService memoryReconciliationService;
    private final ChatSessionMapper chatSessionMapper;
    private final ChatMessagePersistenceService persistenceService;
    private final ChatContextAssembler chatContextAssembler;
    private final SessionSummaryCodec sessionSummaryCodec;
    private final XingnaiChatService xingnaiChatService;
    private final HoshiAiProperties hoshiAiProperties;

    public MemoryReconciliationWorkflow(
            MemoryReconciliationProperties properties,
            MemoryReconciliationService memoryReconciliationService,
            ChatSessionMapper chatSessionMapper,
            ChatMessagePersistenceService persistenceService,
            ChatContextAssembler chatContextAssembler,
            SessionSummaryCodec sessionSummaryCodec,
            XingnaiChatService xingnaiChatService,
            HoshiAiProperties hoshiAiProperties) {
        this.properties = properties;
        this.memoryReconciliationService = memoryReconciliationService;
        this.chatSessionMapper = chatSessionMapper;
        this.persistenceService = persistenceService;
        this.chatContextAssembler = chatContextAssembler;
        this.sessionSummaryCodec = sessionSummaryCodec;
        this.xingnaiChatService = xingnaiChatService;
        this.hoshiAiProperties = hoshiAiProperties;
    }

    public void scanAllUsers() {
        if (!properties.isEnabled()) {
            return;
        }
        List<Long> userIds = listCandidateUserIds(properties.getMaxUsersPerScan());
        for (Long userId : userIds) {
            try {
                reconcileUser(userId);
            } catch (Exception ex) {
                log.warn("Memory reconciliation failed for user {}: {}", userId, ex.getMessage(), ex);
            }
        }
    }

    public int reconcileUser(Long userId) {
        List<UserMemory> activeShort = memoryReconciliationService.listActiveMemories(userId).stream()
                .filter(memory -> "short".equalsIgnoreCase(memory.getMemoryType()))
                .toList();
        if (activeShort.isEmpty()) {
            return 0;
        }
        List<ChatSession> sessions = listRecentSessions(userId, properties.getMaxSessionsPerScan());
        if (sessions.isEmpty()) {
            return 0;
        }

        LocalDateTime archivedSince = LocalDateTime.now().minusDays(properties.getArchivedLookbackDays());
        long archivedCount = memoryReconciliationService.countArchivedSince(userId, archivedSince);
        List<String> recentArchivedHints = memoryReconciliationService.listRecentArchivedContents(
                userId, archivedSince, 5);

        AiPromptBudget promptBudget = hoshiAiProperties.resolvePromptBudget();
        int perSessionTokens = Math.max(
                256,
                promptBudget.workingMemoryTokens() / Math.max(1, properties.getMaxSessionsPerScan()));

        List<AiChatTurn> mergedTurns = new ArrayList<>();
        StringBuilder additionalSummaries = new StringBuilder();
        AiSessionSummary primarySummary = null;
        ChatSession primarySession = sessions.get(0);

        for (int index = 0; index < sessions.size(); index++) {
            ChatSession session = sessions.get(index);
            List<ChatMessage> messages = persistenceService.listRecentMessages(session.getId(), Integer.MAX_VALUE);
            RecentWindow window = chatContextAssembler.selectRecentWindow(
                    messages, session.getCompressedUntilMessageId(), perSessionTokens);
            for (AiChatTurn turn : window.turns()) {
                mergedTurns.add(new AiChatTurn(
                        turn.role(),
                        "[session:" + session.getId() + "] " + turn.content()));
            }
            AiSessionSummary summary = sessionSummaryCodec.hydrateSessionSummary(session);
            if (index == 0) {
                primarySummary = summary;
            } else {
                appendSessionSummaryBlock(additionalSummaries, session.getId(), summary);
            }
        }

        Map<String, Object> metadata = new HashMap<>();
        metadata.put("activeMemories", formatActiveMemories(activeShort));
        metadata.put("archivedCountLast7Days", archivedCount);
        metadata.put("recentArchivedHints", String.join("；", recentArchivedHints));
        if (!additionalSummaries.isEmpty()) {
            metadata.put("additionalSessionSummaries", additionalSummaries.toString().strip());
        }

        AiCognitionTask task = new AiCognitionTask(
                null,
                AiCognitionTaskType.MEMORY_RECONCILIATION,
                primarySession.getId(),
                userId,
                "daily_scan",
                new AiCognitionInput(mergedTurns, primarySummary, metadata));
        AiCognitionResult result = xingnaiChatService.runCognitionTask(task);
        if (!(result.result() instanceof MemoryReconciliationResult payload)) {
            return 0;
        }
        return memoryReconciliationService.applyReconciliationOperations(
                userId,
                primarySession.getId(),
                null,
                payload.operations(),
                hoshiAiProperties.getMemoryReconciliationMinConfidence(),
                recentArchivedHints);
    }

    private List<Long> listCandidateUserIds(int limit) {
        Set<Long> userIds = new LinkedHashSet<>(memoryReconciliationService.listCandidateUserIds(limit));
        LocalDateTime since = LocalDateTime.now().minusDays(properties.getArchivedLookbackDays());
        chatSessionMapper.selectList(new LambdaQueryWrapper<ChatSession>()
                        .ge(ChatSession::getUpdatedAt, since)
                        .orderByDesc(ChatSession::getUpdatedAt))
                .forEach(session -> userIds.add(session.getUserId()));
        return userIds.stream().limit(limit).toList();
    }

    private List<ChatSession> listRecentSessions(Long userId, int limit) {
        return chatSessionMapper.selectList(new LambdaQueryWrapper<ChatSession>()
                .eq(ChatSession::getUserId, userId)
                .orderByDesc(ChatSession::getUpdatedAt)
                .orderByDesc(ChatSession::getId)
                .last("LIMIT " + Math.max(1, limit)));
    }

    private String formatActiveMemories(List<UserMemory> memories) {
        List<String> lines = new ArrayList<>();
        for (UserMemory memory : memories) {
            String line = MemoryReconciliationService.formatActiveMemoryLine(memory);
            if (StringUtils.hasText(line)) {
                lines.add(line);
            }
        }
        return String.join("\n", lines);
    }

    private void appendSessionSummaryBlock(StringBuilder builder, Long sessionId, AiSessionSummary summary) {
        if (summary == null || !summary.hasContent()) {
            return;
        }
        if (!builder.isEmpty()) {
            builder.append("\n\n");
        }
        builder.append("【会话摘要·sessionId=").append(sessionId).append("】\n");
        if (StringUtils.hasText(summary.summaryText())) {
            builder.append(summary.summaryText().trim());
        }
    }
}
