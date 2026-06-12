package com.tsukimiai.hoshi.conversation.service.impl;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicReference;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StringUtils;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.tsukimiai.hoshi.ai.config.HoshiAiProperties;
import com.tsukimiai.hoshi.ai.model.AiChatTurn;
import com.tsukimiai.hoshi.ai.service.XingnaiChatService;
import com.tsukimiai.hoshi.common.exception.AiServiceException;
import com.tsukimiai.hoshi.common.exception.BusinessException;
import com.tsukimiai.hoshi.common.exception.ErrorCode;
import com.tsukimiai.hoshi.common.message.XingnaiMessages;
import com.tsukimiai.hoshi.companion.model.CompanionEmotion;
import com.tsukimiai.hoshi.companion.model.CompanionEventSource;
import com.tsukimiai.hoshi.companion.model.CompanionState;
import com.tsukimiai.hoshi.companion.service.CompanionBroadcastService;
import com.tsukimiai.hoshi.conversation.ChatSessionTitles;
import com.tsukimiai.hoshi.conversation.dto.ChatMessageResponse;
import com.tsukimiai.hoshi.conversation.dto.ChatMessageSegmentResponse;
import com.tsukimiai.hoshi.conversation.dto.ChatSessionResponse;
import com.tsukimiai.hoshi.conversation.dto.ChatStreamSegmentDelta;
import com.tsukimiai.hoshi.conversation.dto.ChatStreamSegmentDone;
import com.tsukimiai.hoshi.conversation.dto.ChatStreamSegmentEmotion;
import com.tsukimiai.hoshi.conversation.dto.ChatStreamSegmentStart;
import com.tsukimiai.hoshi.conversation.entity.ChatMessage;
import com.tsukimiai.hoshi.conversation.entity.ChatMessageSegment;
import com.tsukimiai.hoshi.conversation.entity.ChatMessageRole;
import com.tsukimiai.hoshi.conversation.entity.ChatSession;
import com.tsukimiai.hoshi.conversation.mapper.ChatMessageMapper;
import com.tsukimiai.hoshi.conversation.mapper.ChatMessageSegmentMapper;
import com.tsukimiai.hoshi.conversation.mapper.ChatSessionMapper;
import com.tsukimiai.hoshi.conversation.service.ChatMessageService;
import com.tsukimiai.hoshi.conversation.service.ChatSessionService;
import com.tsukimiai.hoshi.conversation.stream.ChatStreamSink;
import com.tsukimiai.hoshi.conversation.stream.SentenceChunkBuffer;
import com.tsukimiai.hoshi.user.entity.User;

import reactor.core.publisher.Flux;

@Service
public class ChatMessageServiceImpl implements ChatMessageService {

    private static final Logger log = LoggerFactory.getLogger(ChatMessageServiceImpl.class);

    private final ChatMessageMapper chatMessageMapper;
    private final ChatMessageSegmentMapper chatMessageSegmentMapper;
    private final ChatSessionMapper chatSessionMapper;
    private final ChatSessionService chatSessionService;
    private final XingnaiChatService xingnaiChatService;
    private final CompanionBroadcastService companionBroadcastService;
    private final HoshiAiProperties hoshiAiProperties;
    private final TransactionTemplate transactionTemplate;

    public ChatMessageServiceImpl(
            ChatMessageMapper chatMessageMapper,
            ChatMessageSegmentMapper chatMessageSegmentMapper,
            ChatSessionMapper chatSessionMapper,
            ChatSessionService chatSessionService,
            XingnaiChatService xingnaiChatService,
            CompanionBroadcastService companionBroadcastService,
            HoshiAiProperties hoshiAiProperties,
            PlatformTransactionManager transactionManager) {
        this.chatMessageMapper = chatMessageMapper;
        this.chatMessageSegmentMapper = chatMessageSegmentMapper;
        this.chatSessionMapper = chatSessionMapper;
        this.chatSessionService = chatSessionService;
        this.xingnaiChatService = xingnaiChatService;
        this.companionBroadcastService = companionBroadcastService;
        this.hoshiAiProperties = hoshiAiProperties;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
    }

    @Override
    @Transactional(readOnly = true)
    public List<ChatMessage> listBySession(User user, Long sessionId) {
        chatSessionService.get(user, sessionId);
        List<ChatMessage> messages = listRecentMessages(sessionId, Integer.MAX_VALUE);
        hydrateSegments(messages);
        return messages;
    }

    @Override
    public void sendStream(User user, Long sessionId, String content, boolean webSearch, ChatStreamSink sink) {
        try {
            ChatMessage userMessage = transactionTemplate.execute(status -> {
                ChatSession session = chatSessionService.get(user, sessionId);
                ChatMessage saved = insertMessage(sessionId, ChatMessageRole.USER, content.trim());
                touchSession(session);
                return saved;
            });

            sink.emit("user", ChatMessageResponse.from(userMessage));
            streamAssistantReply(user, sessionId, sink, true, webSearch);
        } catch (StreamClientClosedException ex) {
            log.debug("Chat stream closed by client for session {}", sessionId);
        } catch (Exception ex) {
            handleStreamFailure(sessionId, sink, ex, "chat stream");
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
            streamAssistantReply(user, sessionId, sink, false, false);
        } catch (StreamClientClosedException ex) {
            log.debug("Chat retry stream closed by client for session {}", sessionId);
        } catch (Exception ex) {
            handleStreamFailure(sessionId, sink, ex, "chat retry");
        }
    }

    @Override
    public void regenerateStream(User user, Long sessionId, ChatStreamSink sink) {
        try {
            chatSessionService.get(user, sessionId);
            List<ChatMessage> messages = listRecentMessages(sessionId, Integer.MAX_VALUE);
            if (messages.isEmpty()
                    || !ChatMessageRole.ASSISTANT.getValue().equals(messages.get(messages.size() - 1).getRole())) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, XingnaiMessages.regenerateUnavailable());
            }
            ChatMessage lastAssistant = messages.get(messages.size() - 1);
            transactionTemplate.executeWithoutResult(status -> {
                chatMessageMapper.deleteById(lastAssistant.getId());
                ChatSession session = chatSessionService.get(user, sessionId);
                touchSession(session);
            });
            streamAssistantReply(user, sessionId, sink, false, false);
        } catch (StreamClientClosedException ex) {
            log.debug("Chat regenerate stream closed by client for session {}", sessionId);
        } catch (Exception ex) {
            handleStreamFailure(sessionId, sink, ex, "chat regenerate");
        }
    }

    @Override
    public void deleteMessage(User user, Long sessionId, Long messageId) {
        chatSessionService.get(user, sessionId);
        ChatMessage message = chatMessageMapper.selectById(messageId);
        if (message == null || !sessionId.equals(message.getSessionId())) {
            throw new BusinessException(ErrorCode.CHAT_MESSAGE_NOT_FOUND);
        }
        chatMessageMapper.deleteById(messageId);
        ChatSession session = chatSessionService.get(user, sessionId);
        touchSession(session);
    }

    private void streamAssistantReply(
            User user,
            Long sessionId,
            ChatStreamSink sink,
            boolean maybeTitle,
            boolean webSearch) {
        List<AiChatTurn> history = listRecentMessages(sessionId, hoshiAiProperties.getMaxContextMessages())
                .stream()
                .map(message -> new AiChatTurn(message.getRole(), message.getContent()))
                .toList();

        StringBuilder assistantContent = new StringBuilder();
        List<AssistantSegment> streamedSegments = new ArrayList<>();
        AtomicReference<CompanionEmotion> carryEmotion = new AtomicReference<>(CompanionEmotion.NORMAL);
        SentenceChunkBuffer sentenceBuffer = new SentenceChunkBuffer(hoshiAiProperties.getMaxSentenceBufferChars());
        Flux<String> stream = resolveAssistantStream(history, webSearch);
        try {
            stream.doOnNext(delta -> {
                for (String sentence : sentenceBuffer.append(delta)) {
                    streamedSegments.add(processSentence(sink, streamedSegments.size() + 1, sentence, carryEmotion));
                    assistantContent.append(sentence);
                }
            }).blockLast();
        } catch (Exception ex) {
            throw unwrapStreamException(ex);
        }
        for (String sentence : sentenceBuffer.flushRemaining()) {
            streamedSegments.add(processSentence(sink, streamedSegments.size() + 1, sentence, carryEmotion));
            assistantContent.append(sentence);
        }

        String reply = assistantContent.toString().trim();
        if (!StringUtils.hasText(reply)) {
            throw AiServiceException.emptyResponse();
        }

        CompanionEmotion assistantEmotion = streamedSegments.isEmpty()
                ? CompanionEmotion.NORMAL
                : streamedSegments.get(streamedSegments.size() - 1).emotion();
        ChatMessage assistantMessage = transactionTemplate.execute(status -> {
            ChatSession session = chatSessionService.get(user, sessionId);
            ChatMessage saved = insertMessage(sessionId, ChatMessageRole.ASSISTANT, reply, assistantEmotion.getValue());
            saved.setSegments(insertSegments(saved.getId(), streamedSegments));
            touchSession(session);
            return saved;
        });
        companionBroadcastService.publishEmotion(
                CompanionState.DEFAULT_CHARACTER,
                CompanionEmotion.NORMAL,
                CompanionEventSource.CHAT,
                assistantMessage.getId(),
                null);

        if (maybeTitle) {
            maybeAutoTitle(user, sessionId, sink);
        }

        try {
            sink.emit("done", ChatMessageResponse.from(assistantMessage));
        } catch (IOException ex) {
            throw new StreamClientClosedException(ex);
        }
    }

    private void maybeAutoTitle(User user, Long sessionId, ChatStreamSink sink) {
        ChatSession session = chatSessionService.get(user, sessionId);
        if (!ChatSessionTitles.NEW_SESSION.equals(session.getTitle())) {
            return;
        }

        List<ChatMessage> messages = listRecentMessages(sessionId, Integer.MAX_VALUE);
        if (messages.size() != 2) {
            return;
        }

        String userMessage = messages.get(0).getContent();
        String assistantReply = messages.get(1).getContent();
        String title = xingnaiChatService.suggestSessionTitle(userMessage, assistantReply);
        if (!StringUtils.hasText(title)) {
            return;
        }

        transactionTemplate.executeWithoutResult(status -> {
            ChatSession current = chatSessionService.get(user, sessionId);
            if (!ChatSessionTitles.NEW_SESSION.equals(current.getTitle())) {
                return;
            }
            current.setTitle(title.trim());
            chatSessionMapper.updateById(current);
        });

        try {
            sink.emit("session", ChatSessionResponse.from(chatSessionService.get(user, sessionId)));
        } catch (IOException ex) {
            throw new StreamClientClosedException(ex);
        }
    }

    private Flux<String> resolveAssistantStream(List<AiChatTurn> history, boolean webSearch) {
        String latestUserMessage = findLatestUserMessage(history);
        String fixedReply = hoshiAiProperties.findFixedReply(latestUserMessage);
        if (StringUtils.hasText(fixedReply)) {
            return Flux.just(fixedReply);
        }
        return xingnaiChatService.stream(history, webSearch);
    }

    private String findLatestUserMessage(List<AiChatTurn> history) {
        for (int index = history.size() - 1; index >= 0; index--) {
            AiChatTurn turn = history.get(index);
            if ("user".equalsIgnoreCase(turn.role()) && StringUtils.hasText(turn.content())) {
                return turn.content().trim();
            }
        }
        return null;
    }

    private AssistantSegment processSentence(
            ChatStreamSink sink,
            int seq,
            String sentence,
            AtomicReference<CompanionEmotion> carryEmotion) {
        if (seq > 1) {
            paceSentenceGap();
        }
        CompletableFuture<CompanionEmotion> emotionFuture = CompletableFuture.supplyAsync(
                () -> resolveSentenceEmotion(sentence));
        emitSegmentStart(sink, seq, carryEmotion.get(), sentence.length());
        CompanionEmotion emotion = emotionFuture.join();
        carryEmotion.set(emotion);
        emitSegmentEmotion(sink, seq, emotion);
        companionBroadcastService.publishEmotion(
                CompanionState.DEFAULT_CHARACTER,
                emotion,
                CompanionEventSource.CHAT,
                null,
                seq);
        emitSegmentTyping(sink, seq, sentence);
        AssistantSegment segment = new AssistantSegment(seq, sentence, emotion);
        emitSegmentDone(sink, segment.seq(), segment.content(), segment.emotion());
        return segment;
    }

    private void emitSegmentTyping(ChatStreamSink sink, int seq, String sentence) {
        for (int codePoint : sentence.codePoints().toArray()) {
            emitSegmentDelta(sink, seq, new String(Character.toChars(codePoint)));
            paceSentencePlayback();
        }
    }

    private void paceSentencePlayback() {
        sleepPlaybackDelay(hoshiAiProperties.getSentencePlaybackCharDelayMs());
    }

    private void paceSentenceGap() {
        sleepPlaybackDelay(hoshiAiProperties.getSentenceGapDelayMs());
    }

    private void sleepPlaybackDelay(int delayMs) {
        if (delayMs <= 0) {
            return;
        }
        try {
            Thread.sleep(delayMs);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Sentence playback interrupted", ex);
        }
    }

    private void emitSegmentEmotion(ChatStreamSink sink, int seq, CompanionEmotion emotion) {
        try {
            sink.emit("segment_emotion", new ChatStreamSegmentEmotion(seq, emotion.getValue()));
        } catch (IOException ex) {
            throw new StreamClientClosedException(ex);
        }
    }

    private void emitSegmentStart(ChatStreamSink sink, int seq, CompanionEmotion emotion, int contentLength) {
        try {
            sink.emit("segment_start", new ChatStreamSegmentStart(
                    seq,
                    emotion.getValue(),
                    contentLength));
        } catch (IOException ex) {
            throw new StreamClientClosedException(ex);
        }
    }

    private void emitSegmentDelta(ChatStreamSink sink, int seq, String delta) {
        try {
            sink.emit("segment_delta", new ChatStreamSegmentDelta(seq, delta));
        } catch (IOException ex) {
            throw new StreamClientClosedException(ex);
        }
    }

    private void emitSegmentDone(ChatStreamSink sink, int seq, String content, CompanionEmotion emotion) {
        try {
            sink.emit("segment_done", new ChatStreamSegmentDone(
                    seq,
                    content,
                    emotion.getValue()));
        } catch (IOException ex) {
            throw new StreamClientClosedException(ex);
        }
    }

    private void handleStreamFailure(Long sessionId, ChatStreamSink sink, Exception ex, String action) {
        BusinessException businessException = resolveBusinessException(ex);
        if (businessException != null) {
            log.warn("{} failed for session {}: {}", action, sessionId, businessException.getMessage());
            emitFriendlyError(sink, businessException);
            return;
        }
        log.error("Unexpected {} failure for session {}", action, sessionId, ex);
        emitFriendlyError(sink, ErrorCode.INTERNAL_ERROR, XingnaiMessages.aiUnexpected());
    }

    private BusinessException resolveBusinessException(Throwable ex) {
        Throwable current = ex;
        while (current != null) {
            if (current instanceof BusinessException businessException) {
                return businessException;
            }
            current = current.getCause();
        }
        return null;
    }

    private RuntimeException unwrapStreamException(Throwable ex) {
        BusinessException businessException = resolveBusinessException(ex);
        if (businessException != null) {
            return businessException;
        }
        if (ex instanceof RuntimeException runtimeException) {
            return runtimeException;
        }
        return new IllegalStateException(ex);
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

    private CompanionEmotion resolveSentenceEmotion(String sentence) {
        try {
            String suggested = xingnaiChatService.suggestEmotion(sentence, CompanionEmotion.protocolValues());
            return CompanionEmotion.fromValue(suggested);
        } catch (Exception ex) {
            log.warn("Emotion classification failed, fallback to normal", ex);
            return CompanionEmotion.NORMAL;
        }
    }

    private List<ChatMessageSegment> insertSegments(Long messageId, List<AssistantSegment> segments) {
        List<ChatMessageSegment> savedSegments = new ArrayList<>(segments.size());
        LocalDateTime now = LocalDateTime.now();
        for (AssistantSegment segment : segments) {
            ChatMessageSegment saved = new ChatMessageSegment();
            saved.setMessageId(messageId);
            saved.setSeq(segment.seq());
            saved.setContent(segment.content());
            saved.setEmotion(segment.emotion().getValue());
            saved.setCreatedAt(now);
            chatMessageSegmentMapper.insert(saved);
            savedSegments.add(saved);
        }
        return savedSegments;
    }

    private void hydrateSegments(List<ChatMessage> messages) {
        if (messages.isEmpty()) {
            return;
        }
        List<Long> messageIds = messages.stream()
                .map(ChatMessage::getId)
                .toList();
        List<ChatMessageSegment> segments = chatMessageSegmentMapper.selectList(
                new LambdaQueryWrapper<ChatMessageSegment>()
                        .in(ChatMessageSegment::getMessageId, messageIds)
                        .orderByAsc(ChatMessageSegment::getMessageId)
                        .orderByAsc(ChatMessageSegment::getSeq)
                        .orderByAsc(ChatMessageSegment::getId));
        Map<Long, List<ChatMessageSegment>> segmentMap = new HashMap<>();
        for (ChatMessageSegment segment : segments) {
            segmentMap.computeIfAbsent(segment.getMessageId(), ignored -> new ArrayList<>()).add(segment);
        }
        for (ChatMessage message : messages) {
            message.setSegments(segmentMap.getOrDefault(message.getId(), List.of()));
        }
    }

    private ChatMessage insertMessage(Long sessionId, ChatMessageRole role, String content) {
        return insertMessage(sessionId, role, content, null);
    }

    private ChatMessage insertMessage(Long sessionId, ChatMessageRole role, String content, String emotion) {
        LocalDateTime now = LocalDateTime.now();
        ChatMessage message = new ChatMessage();
        message.setSessionId(sessionId);
        message.setRole(role.getValue());
        message.setContent(content);
        message.setEmotion(emotion);
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

    private record AssistantSegment(
            int seq,
            String content,
            CompanionEmotion emotion) {
    }
}
