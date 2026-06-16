package com.tsukimiai.hoshi.conversation.service.impl;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import com.tsukimiai.hoshi.common.exception.BusinessException;
import com.tsukimiai.hoshi.common.exception.ErrorCode;
import com.tsukimiai.hoshi.common.message.XingnaiMessages;
import com.tsukimiai.hoshi.conversation.application.ChatMessagePersistenceService;
import com.tsukimiai.hoshi.conversation.application.ChatStreamErrorHandler;
import com.tsukimiai.hoshi.conversation.application.ChatStreamOrchestrator;
import com.tsukimiai.hoshi.conversation.application.proactive.ProactiveReplyTracker;
import com.tsukimiai.hoshi.conversation.dto.ChatMessageResponse;
import com.tsukimiai.hoshi.conversation.dto.ChatStreamPlaybackSettings;
import com.tsukimiai.hoshi.conversation.entity.ChatMessage;
import com.tsukimiai.hoshi.conversation.entity.ChatMessageRole;
import com.tsukimiai.hoshi.conversation.entity.ChatSession;
import com.tsukimiai.hoshi.conversation.service.ChatMessageService;
import com.tsukimiai.hoshi.conversation.service.ChatSessionService;
import com.tsukimiai.hoshi.conversation.support.StreamClientClosedException;
import com.tsukimiai.hoshi.conversation.stream.ChatStreamSink;
import com.tsukimiai.hoshi.user.entity.User;

@Service
public class ChatMessageServiceImpl implements ChatMessageService {

    private static final Logger log = LoggerFactory.getLogger(ChatMessageServiceImpl.class);

    private final ChatMessagePersistenceService persistenceService;
    private final ChatStreamOrchestrator streamOrchestrator;
    private final ChatStreamErrorHandler streamErrorHandler;
    private final ChatSessionService chatSessionService;
    private final ProactiveReplyTracker proactiveReplyTracker;
    private final TransactionTemplate transactionTemplate;

    public ChatMessageServiceImpl(
            ChatMessagePersistenceService persistenceService,
            ChatStreamOrchestrator streamOrchestrator,
            ChatStreamErrorHandler streamErrorHandler,
            ChatSessionService chatSessionService,
            ProactiveReplyTracker proactiveReplyTracker,
            PlatformTransactionManager transactionManager) {
        this.persistenceService = persistenceService;
        this.streamOrchestrator = streamOrchestrator;
        this.streamErrorHandler = streamErrorHandler;
        this.chatSessionService = chatSessionService;
        this.proactiveReplyTracker = proactiveReplyTracker;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
    }

    @Override
    @Transactional(readOnly = true)
    public List<ChatMessage> listBySession(User user, Long sessionId) {
        chatSessionService.get(user, sessionId);
        List<ChatMessage> messages = persistenceService.listRecentMessages(sessionId, Integer.MAX_VALUE);
        persistenceService.hydrateSegments(messages);
        return messages;
    }

    @Override
    public void sendStream(
            User user,
            Long sessionId,
            String content,
            boolean webSearch,
            ChatStreamPlaybackSettings playback,
            ChatStreamSink sink) {
        try {
            ChatMessage userMessage = transactionTemplate.execute(status -> {
                ChatSession session = chatSessionService.get(user, sessionId);
                ChatMessage saved = persistenceService.insertMessage(
                        sessionId, ChatMessageRole.USER, content.trim(), null, webSearch);
                persistenceService.touchSession(session);
                return saved;
            });

            proactiveReplyTracker.markResponded(sessionId);
            sink.emit("user", ChatMessageResponse.from(userMessage));
            streamOrchestrator.streamAssistantReply(user, sessionId, sink, true, webSearch, playback);
        } catch (StreamClientClosedException ex) {
            log.debug("Chat stream closed by client for session {}", sessionId);
        } catch (Exception ex) {
            streamErrorHandler.handleStreamFailure(sessionId, sink, ex, "chat stream");
        }
    }

    @Override
    public void retryStream(User user, Long sessionId, ChatStreamPlaybackSettings playback, ChatStreamSink sink) {
        try {
            chatSessionService.get(user, sessionId);
            List<ChatMessage> messages = persistenceService.listRecentMessages(sessionId, Integer.MAX_VALUE);
            if (messages.isEmpty() || !ChatMessageRole.USER.getValue().equals(messages.get(messages.size() - 1).getRole())) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, XingnaiMessages.retryUnavailable());
            }
            streamOrchestrator.streamAssistantReply(user, sessionId, sink, false, false, playback);
        } catch (StreamClientClosedException ex) {
            log.debug("Chat retry stream closed by client for session {}", sessionId);
        } catch (Exception ex) {
            streamErrorHandler.handleStreamFailure(sessionId, sink, ex, "chat retry");
        }
    }

    @Override
    public void regenerateStream(User user, Long sessionId, ChatStreamPlaybackSettings playback, ChatStreamSink sink) {
        try {
            chatSessionService.get(user, sessionId);
            List<ChatMessage> messages = persistenceService.listRecentMessages(sessionId, Integer.MAX_VALUE);
            if (messages.isEmpty()
                    || !ChatMessageRole.ASSISTANT.getValue().equals(messages.get(messages.size() - 1).getRole())) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, XingnaiMessages.regenerateUnavailable());
            }
            ChatMessage lastAssistant = messages.get(messages.size() - 1);
            transactionTemplate.executeWithoutResult(status -> {
                persistenceService.deleteMessageById(lastAssistant.getId());
                ChatSession session = chatSessionService.get(user, sessionId);
                persistenceService.clearSessionSummary(session);
                persistenceService.touchSession(session);
            });
            streamOrchestrator.streamAssistantReply(user, sessionId, sink, false, false, playback);
        } catch (StreamClientClosedException ex) {
            log.debug("Chat regenerate stream closed by client for session {}", sessionId);
        } catch (Exception ex) {
            streamErrorHandler.handleStreamFailure(sessionId, sink, ex, "chat regenerate");
        }
    }

    @Override
    public void deleteMessage(User user, Long sessionId, Long messageId) {
        chatSessionService.get(user, sessionId);
        ChatMessage message = persistenceService.findMessage(messageId);
        if (message == null || !sessionId.equals(message.getSessionId())) {
            throw new BusinessException(ErrorCode.CHAT_MESSAGE_NOT_FOUND);
        }
        persistenceService.deleteMessageById(messageId);
        ChatSession session = chatSessionService.get(user, sessionId);
        persistenceService.clearSessionSummary(session);
        persistenceService.touchSession(session);
    }
}
