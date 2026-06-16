package com.tsukimiai.hoshi.conversation.application;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StringUtils;

import com.tsukimiai.hoshi.ai.cognition.AiCognitionInput;
import com.tsukimiai.hoshi.ai.cognition.AiCognitionResult;
import com.tsukimiai.hoshi.ai.cognition.AiCognitionTask;
import com.tsukimiai.hoshi.ai.cognition.AiCognitionTaskType;
import com.tsukimiai.hoshi.ai.cognition.SessionCompactionResult;
import com.tsukimiai.hoshi.ai.config.HoshiAiProperties;
import com.tsukimiai.hoshi.ai.model.AiChatTurn;
import com.tsukimiai.hoshi.ai.model.AiPromptBudget;
import com.tsukimiai.hoshi.ai.service.XingnaiChatService;
import com.tsukimiai.hoshi.conversation.entity.ChatMessage;
import com.tsukimiai.hoshi.conversation.entity.ChatSession;
import com.tsukimiai.hoshi.conversation.mapper.ChatSessionMapper;
import com.tsukimiai.hoshi.conversation.service.ChatSessionService;
import com.tsukimiai.hoshi.conversation.support.RecentWindow;
import com.tsukimiai.hoshi.user.entity.User;

@Service
public class SessionCompactionWorkflow {

    private static final Logger log = LoggerFactory.getLogger(SessionCompactionWorkflow.class);

    private final ChatSessionService chatSessionService;
    private final ChatMessagePersistenceService persistenceService;
    private final ChatContextAssembler chatContextAssembler;
    private final SessionSummaryCodec sessionSummaryCodec;
    private final ChatSessionMapper chatSessionMapper;
    private final XingnaiChatService xingnaiChatService;
    private final HoshiAiProperties hoshiAiProperties;
    private final TransactionTemplate transactionTemplate;
    private final MemoryReconciliationService memoryReconciliationService;
    private final CognitionBackgroundTaskExecutor backgroundTaskExecutor;

    public SessionCompactionWorkflow(
            ChatSessionService chatSessionService,
            ChatMessagePersistenceService persistenceService,
            ChatContextAssembler chatContextAssembler,
            SessionSummaryCodec sessionSummaryCodec,
            ChatSessionMapper chatSessionMapper,
            XingnaiChatService xingnaiChatService,
            HoshiAiProperties hoshiAiProperties,
            PlatformTransactionManager transactionManager,
            MemoryReconciliationService memoryReconciliationService,
            CognitionBackgroundTaskExecutor backgroundTaskExecutor) {
        this.chatSessionService = chatSessionService;
        this.persistenceService = persistenceService;
        this.chatContextAssembler = chatContextAssembler;
        this.sessionSummaryCodec = sessionSummaryCodec;
        this.chatSessionMapper = chatSessionMapper;
        this.xingnaiChatService = xingnaiChatService;
        this.hoshiAiProperties = hoshiAiProperties;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
        this.memoryReconciliationService = memoryReconciliationService;
        this.backgroundTaskExecutor = backgroundTaskExecutor;
    }

    public void triggerPostReplyCompactionAsync(User user, Long sessionId) {
        backgroundTaskExecutor.submit(
                "session-compaction",
                () -> runSessionCompaction(user, sessionId));
    }

    public void runSessionCompaction(User user, Long sessionId) {
        ChatSession session = chatSessionService.get(user, sessionId);
        List<ChatMessage> messages = persistenceService.listRecentMessages(sessionId, Integer.MAX_VALUE);
        AiPromptBudget promptBudget = hoshiAiProperties.resolvePromptBudget();
        RecentWindow recentWindow = chatContextAssembler.selectRecentWindow(
                messages, session.getCompressedUntilMessageId(), promptBudget.workingMemoryTokens());
        List<ChatMessage> uncompactedMessages = chatContextAssembler.listUncompactedMessages(
                messages, session.getCompressedUntilMessageId());
        if (!chatContextAssembler.shouldCompactSession(uncompactedMessages, promptBudget, recentWindow.firstMessageId())) {
            return;
        }
        List<AiChatTurn> turnsToCompact = chatContextAssembler.selectTurnsToCompact(
                messages, session.getCompressedUntilMessageId(), recentWindow.firstMessageId());
        if (turnsToCompact.isEmpty()) {
            return;
        }
        Long lastMessageId = chatContextAssembler.findLastMessageIdBefore(messages, recentWindow.firstMessageId());
        AiCognitionTask task = new AiCognitionTask(
                null,
                AiCognitionTaskType.SESSION_COMPACTION,
                sessionId,
                user.getId(),
                "context_budget_threshold",
                new AiCognitionInput(
                        turnsToCompact,
                        sessionSummaryCodec.hydrateSessionSummary(session),
                        Map.of("compressedUntilMessageId", lastMessageId == null ? 0L : lastMessageId)));
        AiCognitionResult result = xingnaiChatService.runCognitionTask(task);
        if (!(result.result() instanceof SessionCompactionResult payload) || !StringUtils.hasText(payload.summaryText())) {
            return;
        }
        transactionTemplate.executeWithoutResult(status -> {
            ChatSession current = chatSessionService.get(user, sessionId);
            current.setSummary(payload.summaryText());
            current.setSummaryFacts(sessionSummaryCodec.writeStringList(payload.facts()));
            current.setSummaryDecisions(sessionSummaryCodec.writeStringList(payload.decisions()));
            current.setSummaryOpenLoops(sessionSummaryCodec.writeStringList(payload.openLoops()));
            int nextSummaryVersion = current.getSummaryVersion() == null ? 1 : current.getSummaryVersion() + 1;
            current.setSummaryVersion(nextSummaryVersion);
            current.setCompressedUntilMessageId(
                    payload.compressedUntilMessageId() == null ? lastMessageId : payload.compressedUntilMessageId());
            current.setSummaryUpdatedAt(LocalDateTime.now());
            chatSessionMapper.updateById(current);
        });
        if (payload.staleItems() != null && !payload.staleItems().isEmpty()) {
            memoryReconciliationService.archiveByStaleHints(user.getId(), payload.staleItems());
        }
    }
}
