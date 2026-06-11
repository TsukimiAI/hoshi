package com.tsukimiai.hoshi.conversation.service.impl;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StringUtils;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.tsukimiai.hoshi.ai.config.HoshiAiProperties;
import com.tsukimiai.hoshi.common.exception.AiServiceException;
import com.tsukimiai.hoshi.common.message.XingnaiMessages;
import com.tsukimiai.hoshi.ai.model.AiChatTurn;
import com.tsukimiai.hoshi.ai.service.XingnaiChatService;
import com.tsukimiai.hoshi.common.exception.BusinessException;
import com.tsukimiai.hoshi.common.exception.ErrorCode;
import com.tsukimiai.hoshi.conversation.dto.ChatMessageResponse;
import com.tsukimiai.hoshi.conversation.dto.ChatStreamDelta;
import com.tsukimiai.hoshi.conversation.entity.ChatMessage;
import com.tsukimiai.hoshi.conversation.entity.ChatMessageRole;
import com.tsukimiai.hoshi.conversation.entity.ChatSession;
import com.tsukimiai.hoshi.conversation.mapper.ChatMessageMapper;
import com.tsukimiai.hoshi.conversation.mapper.ChatSessionMapper;
import com.tsukimiai.hoshi.conversation.service.ChatMessageService;
import com.tsukimiai.hoshi.conversation.service.ChatSessionService;
import com.tsukimiai.hoshi.conversation.stream.ChatStreamSink;
import com.tsukimiai.hoshi.user.entity.User;

import reactor.core.publisher.Flux;

@Service
public class ChatMessageServiceImpl implements ChatMessageService {

    private static final Logger log = LoggerFactory.getLogger(ChatMessageServiceImpl.class);

    private final ChatMessageMapper chatMessageMapper;
    private final ChatSessionMapper chatSessionMapper;
    private final ChatSessionService chatSessionService;
    private final XingnaiChatService xingnaiChatService;
    private final HoshiAiProperties hoshiAiProperties;
    private final TransactionTemplate transactionTemplate;

    public ChatMessageServiceImpl(
            ChatMessageMapper chatMessageMapper,
            ChatSessionMapper chatSessionMapper,
            ChatSessionService chatSessionService,
            XingnaiChatService xingnaiChatService,
            HoshiAiProperties hoshiAiProperties,
            PlatformTransactionManager transactionManager) {
        this.chatMessageMapper = chatMessageMapper;
        this.chatSessionMapper = chatSessionMapper;
        this.chatSessionService = chatSessionService;
        this.xingnaiChatService = xingnaiChatService;
        this.hoshiAiProperties = hoshiAiProperties;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
    }

    @Override
    @Transactional(readOnly = true)
    public List<ChatMessage> listBySession(User user, Long sessionId) {
        chatSessionService.get(user, sessionId);
        return listRecentMessages(sessionId, Integer.MAX_VALUE);
    }

    @Override
    public void sendStream(User user, Long sessionId, String content, ChatStreamSink sink) {
        try {
            ChatMessage userMessage = transactionTemplate.execute(status -> {
                ChatSession session = chatSessionService.get(user, sessionId);
                ChatMessage saved = insertMessage(sessionId, ChatMessageRole.USER, content.trim());
                touchSession(session);
                return saved;
            });

            sink.emit("user", ChatMessageResponse.from(userMessage));
            streamAssistantReply(user, sessionId, sink);
        } catch (StreamClientClosedException ex) {
            log.debug("Chat stream closed by client for session {}", sessionId);
        } catch (BusinessException ex) {
            emitFriendlyError(sink, ex);
        } catch (Exception ex) {
            log.error("Unexpected chat stream failure for session {}", sessionId, ex);
            emitFriendlyError(sink, ErrorCode.INTERNAL_ERROR, XingnaiMessages.aiUnexpected());
        }
    }

    @Override
    public void retryStream(User user, Long sessionId, ChatStreamSink sink) {
        try {
            chatSessionService.get(user, sessionId);
            List<ChatMessage> messages = listRecentMessages(sessionId, Integer.MAX_VALUE);
            if (messages.isEmpty() || !ChatMessageRole.USER.getValue().equals(messages.get(messages.size() - 1).getRole())) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, XingnaiMessages.retryUnavailable());
            }
            streamAssistantReply(user, sessionId, sink);
        } catch (StreamClientClosedException ex) {
            log.debug("Chat retry stream closed by client for session {}", sessionId);
        } catch (BusinessException ex) {
            emitFriendlyError(sink, ex);
        } catch (Exception ex) {
            log.error("Unexpected chat retry failure for session {}", sessionId, ex);
            emitFriendlyError(sink, ErrorCode.INTERNAL_ERROR, XingnaiMessages.aiUnexpected());
        }
    }

    private void streamAssistantReply(User user, Long sessionId, ChatStreamSink sink) {
        List<AiChatTurn> history = listRecentMessages(sessionId, hoshiAiProperties.getMaxContextMessages())
                .stream()
                .map(message -> new AiChatTurn(message.getRole(), message.getContent()))
                .toList();

        StringBuilder assistantContent = new StringBuilder();
        Flux<String> stream = xingnaiChatService.stream(history);
        stream.doOnNext(delta -> {
            assistantContent.append(delta);
            emitDelta(sink, delta);
        }).blockLast();

        String reply = assistantContent.toString().trim();
        if (!StringUtils.hasText(reply)) {
            throw AiServiceException.emptyResponse();
        }

        ChatMessage assistantMessage = transactionTemplate.execute(status -> {
            ChatSession session = chatSessionService.get(user, sessionId);
            ChatMessage saved = insertMessage(sessionId, ChatMessageRole.ASSISTANT, reply);
            touchSession(session);
            return saved;
        });

        try {
            sink.emit("done", ChatMessageResponse.from(assistantMessage));
        } catch (IOException ex) {
            throw new StreamClientClosedException(ex);
        }
    }

    private void emitDelta(ChatStreamSink sink, String delta) {
        try {
            sink.emit("delta", new ChatStreamDelta(delta));
        } catch (IOException ex) {
            throw new StreamClientClosedException(ex);
        }
    }

    private void emitFriendlyError(ChatStreamSink sink, BusinessException ex) {
        emitFriendlyError(sink, ex.getErrorCode(),
                XingnaiMessages.forErrorCode(ex.getErrorCode(), ex.getMessage()));
    }

    private void emitFriendlyError(ChatStreamSink sink, ErrorCode errorCode, String message) {
        try {
            sink.emitError(errorCode.getCode(), message);
        } catch (IOException ignored) {
            // Client disconnected while streaming.
        }
    }

    private void touchSession(ChatSession session) {
        session.setUpdatedAt(LocalDateTime.now());
        chatSessionMapper.updateById(session);
    }

    private ChatMessage insertMessage(Long sessionId, ChatMessageRole role, String content) {
        LocalDateTime now = LocalDateTime.now();
        ChatMessage message = new ChatMessage();
        message.setSessionId(sessionId);
        message.setRole(role.getValue());
        message.setContent(content);
        message.setCreatedAt(now);
        chatMessageMapper.insert(message);
        return message;
    }

    private List<ChatMessage> listRecentMessages(Long sessionId, int limit) {
        LambdaQueryWrapper<ChatMessage> query = new LambdaQueryWrapper<ChatMessage>()
                .eq(ChatMessage::getSessionId, sessionId)
                .orderByDesc(ChatMessage::getCreatedAt)
                .orderByDesc(ChatMessage::getId);
        if (limit != Integer.MAX_VALUE) {
            query.last("LIMIT " + limit);
        }
        List<ChatMessage> messages = new ArrayList<>(chatMessageMapper.selectList(query));
        Collections.reverse(messages);
        return messages;
    }

    private static final class StreamClientClosedException extends RuntimeException {
        private StreamClientClosedException(IOException cause) {
            super(cause);
        }
    }
}
