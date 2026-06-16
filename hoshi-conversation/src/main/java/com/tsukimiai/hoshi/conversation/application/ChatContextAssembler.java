package com.tsukimiai.hoshi.conversation.application;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.tsukimiai.hoshi.ai.cognition.AiCognitionInput;
import com.tsukimiai.hoshi.ai.config.HoshiAiProperties;
import com.tsukimiai.hoshi.ai.model.AiChatContext;
import com.tsukimiai.hoshi.ai.model.AiChatRequest;
import com.tsukimiai.hoshi.ai.model.AiChatTurn;
import com.tsukimiai.hoshi.ai.model.AiMemoryContext;
import com.tsukimiai.hoshi.ai.model.AiPromptBudget;
import com.tsukimiai.hoshi.ai.model.AiSessionSummary;
import com.tsukimiai.hoshi.conversation.entity.ChatMessage;
import com.tsukimiai.hoshi.conversation.entity.ChatSession;
import com.tsukimiai.hoshi.conversation.service.ChatSessionService;
import com.tsukimiai.hoshi.conversation.support.RecentWindow;
import com.tsukimiai.hoshi.user.entity.User;

@Service
public class ChatContextAssembler {

    private final ChatSessionService chatSessionService;
    private final ChatMessagePersistenceService persistenceService;
    private final MemoryExtractionWorkflow memoryExtractionWorkflow;
    private final SessionSummaryCodec sessionSummaryCodec;
    private final HoshiAiProperties hoshiAiProperties;

    public ChatContextAssembler(
            ChatSessionService chatSessionService,
            ChatMessagePersistenceService persistenceService,
            MemoryExtractionWorkflow memoryExtractionWorkflow,
            SessionSummaryCodec sessionSummaryCodec,
            HoshiAiProperties hoshiAiProperties) {
        this.chatSessionService = chatSessionService;
        this.persistenceService = persistenceService;
        this.memoryExtractionWorkflow = memoryExtractionWorkflow;
        this.sessionSummaryCodec = sessionSummaryCodec;
        this.hoshiAiProperties = hoshiAiProperties;
    }

    public AiChatRequest buildChatRequest(User user, Long sessionId, boolean webSearch) {
        ChatSession session = chatSessionService.get(user, sessionId);
        List<ChatMessage> messages = persistenceService.listRecentMessages(sessionId, Integer.MAX_VALUE);
        AiChatContext context = buildChatContext(user.getId(), session, messages);
        memoryExtractionWorkflow.reinforceRetrievedMemories(context.shortMemories(), context.longMemories());
        return new AiChatRequest(context, webSearch);
    }

    public AiChatContext buildChatContext(Long userId, ChatSession session, List<ChatMessage> messages) {
        return buildChatContext(userId, session, messages, null);
    }

    public AiChatContext buildChatContext(
            Long userId,
            ChatSession session,
            List<ChatMessage> messages,
            String retrievalQueryOverride) {
        AiPromptBudget promptBudget = hoshiAiProperties.resolvePromptBudget();
        RecentWindow recentWindow = selectRecentWindow(messages, session.getCompressedUntilMessageId(), promptBudget.workingMemoryTokens());
        String latestUserMessage = StringUtils.hasText(retrievalQueryOverride)
                ? retrievalQueryOverride.trim()
                : findLatestUserMessage(recentWindow.turns());
        AiSessionSummary sessionSummary = sessionSummaryCodec.hydrateSessionSummary(session);
        List<AiMemoryContext> shortMemories = memoryExtractionWorkflow.selectShortMemories(
                userId, latestUserMessage, promptBudget.shortMemoryTokens());
        List<AiMemoryContext> longMemories = memoryExtractionWorkflow.selectLongMemories(
                userId, latestUserMessage, promptBudget.longMemoryTokens());
        return new AiChatContext(
                recentWindow.turns(),
                sessionSummary,
                shortMemories,
                longMemories,
                List.of(),
                promptBudget);
    }

    public AiCognitionInput buildProactiveCognitionContext(
            Long userId,
            ChatSession session,
            List<ChatMessage> messages,
            String retrievalQuery,
            Map<String, Object> anchorMetadata) {
        AiChatContext context = buildChatContext(userId, session, messages, retrievalQuery);
        memoryExtractionWorkflow.reinforceRetrievedMemories(context.shortMemories(), context.longMemories());
        Map<String, Object> metadata = new HashMap<>();
        if (anchorMetadata != null) {
            metadata.putAll(anchorMetadata);
        }
        metadata.put("chatContext", context);
        return new AiCognitionInput(context.recentTurns(), context.sessionSummary(), metadata);
    }

    public RecentWindow selectRecentWindow(List<ChatMessage> messages, Long compressedUntilMessageId, int budgetTokens) {
        List<ChatMessage> candidates = messages.stream()
                .filter(message -> compressedUntilMessageId == null || message.getId() > compressedUntilMessageId)
                .toList();
        List<AiChatTurn> selected = new ArrayList<>();
        Long firstMessageId = null;
        int usedTokens = 0;
        for (int index = candidates.size() - 1; index >= 0; index--) {
            ChatMessage message = candidates.get(index);
            int estimate = estimateTokens(message.getContent()) + estimateTokens(message.getRole()) + 8;
            if (!selected.isEmpty() && usedTokens + estimate > budgetTokens) {
                break;
            }
            selected.add(0, new AiChatTurn(message.getRole(), message.getContent()));
            firstMessageId = message.getId();
            usedTokens += estimate;
        }
        if (selected.isEmpty() && !candidates.isEmpty()) {
            ChatMessage last = candidates.get(candidates.size() - 1);
            selected.add(new AiChatTurn(last.getRole(), last.getContent()));
            firstMessageId = last.getId();
            usedTokens = estimateTokens(last.getContent()) + estimateTokens(last.getRole()) + 8;
        }
        return new RecentWindow(selected, firstMessageId, usedTokens);
    }

    public String findLatestUserMessage(List<AiChatTurn> history) {
        for (int index = history.size() - 1; index >= 0; index--) {
            AiChatTurn turn = history.get(index);
            if ("user".equalsIgnoreCase(turn.role()) && StringUtils.hasText(turn.content())) {
                return turn.content().trim();
            }
        }
        return null;
    }

    public List<ChatMessage> listUncompactedMessages(List<ChatMessage> messages, Long compressedUntilMessageId) {
        return messages.stream()
                .filter(message -> compressedUntilMessageId == null || message.getId() > compressedUntilMessageId)
                .toList();
    }

    public List<AiChatTurn> selectTurnsToCompact(List<ChatMessage> messages, Long compressedUntilMessageId, Long firstRecentMessageId) {
        if (firstRecentMessageId == null) {
            return List.of();
        }
        return messages.stream()
                .filter(message -> (compressedUntilMessageId == null || message.getId() > compressedUntilMessageId)
                        && message.getId() < firstRecentMessageId)
                .map(message -> new AiChatTurn(message.getRole(), message.getContent()))
                .toList();
    }

    public Long findLastMessageIdBefore(List<ChatMessage> messages, Long firstRecentMessageId) {
        Long last = null;
        for (ChatMessage message : messages) {
            if (firstRecentMessageId != null && message.getId() >= firstRecentMessageId) {
                break;
            }
            last = message.getId();
        }
        return last;
    }

    public boolean shouldCompactSession(List<ChatMessage> uncompactedMessages, AiPromptBudget budget, Long firstRecentMessageId) {
        if (uncompactedMessages.isEmpty() || firstRecentMessageId == null) {
            return false;
        }
        int rawTokens = uncompactedMessages.stream()
                .mapToInt(message -> estimateTokens(message.getContent()) + 8)
                .sum();
        int turnsToCompact = (int) uncompactedMessages.stream()
                .filter(message -> message.getId() < firstRecentMessageId)
                .count();
        return rawTokens >= budget.workingMemoryTokens() * hoshiAiProperties.getContextCompactionThreshold()
                || rawTokens >= budget.effectiveInputTokens() * hoshiAiProperties.getContextOverflowThreshold()
                || turnsToCompact >= hoshiAiProperties.getMaxUncompactedTurns();
    }

    private int estimateTokens(String text) {
        if (!StringUtils.hasText(text)) {
            return 0;
        }
        int length = text.codePointCount(0, text.length());
        return Math.max(1, length / 2);
    }
}
