package com.tsukimiai.hoshi.conversation.application;

import java.io.IOException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicReference;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StringUtils;

import com.tsukimiai.hoshi.ai.config.HoshiAiProperties;
import com.tsukimiai.hoshi.ai.model.AiChatRequest;
import com.tsukimiai.hoshi.ai.service.XingnaiChatService;
import com.tsukimiai.hoshi.common.companion.CompanionEmotion;
import com.tsukimiai.hoshi.common.companion.CompanionEventSource;
import com.tsukimiai.hoshi.common.exception.AiServiceException;
import com.tsukimiai.hoshi.conversation.dto.ChatMessageResponse;
import com.tsukimiai.hoshi.conversation.dto.ChatStreamPlaybackSettings;
import com.tsukimiai.hoshi.conversation.dto.ChatStreamSegmentDelta;
import com.tsukimiai.hoshi.conversation.dto.ChatStreamSegmentDone;
import com.tsukimiai.hoshi.conversation.dto.ChatStreamSegmentEmotion;
import com.tsukimiai.hoshi.conversation.dto.ChatStreamSegmentStart;
import com.tsukimiai.hoshi.ai.cognition.ProactiveFollowUpContentResult;
import com.tsukimiai.hoshi.conversation.application.proactive.ProactiveFollowUpWorkflow;
import com.tsukimiai.hoshi.conversation.dto.ChatStreamFollowUpEnd;
import com.tsukimiai.hoshi.conversation.dto.ChatStreamFollowUpStart;
import com.tsukimiai.hoshi.conversation.entity.ChatMessage;
import com.tsukimiai.hoshi.conversation.entity.ChatMessageSource;
import com.tsukimiai.hoshi.conversation.entity.ChatMessageRole;
import com.tsukimiai.hoshi.conversation.entity.ChatSession;
import com.tsukimiai.hoshi.conversation.service.ChatSessionService;
import com.tsukimiai.hoshi.conversation.stream.ChatStreamSink;
import com.tsukimiai.hoshi.conversation.stream.SentenceChunkBuffer;
import com.tsukimiai.hoshi.conversation.support.AssistantSegment;
import com.tsukimiai.hoshi.conversation.support.StreamClientClosedException;
import com.tsukimiai.hoshi.conversation.support.StreamPlaybackContext;
import com.tsukimiai.hoshi.user.entity.User;

import io.micrometer.core.instrument.DistributionSummary;
import io.micrometer.core.instrument.MeterRegistry;
import reactor.core.publisher.Flux;

@Service
public class ChatStreamOrchestrator {

    private static final Logger log = LoggerFactory.getLogger(ChatStreamOrchestrator.class);

    private final ChatSessionService chatSessionService;
    private final ChatMessagePersistenceService persistenceService;
    private final ChatContextAssembler chatContextAssembler;
    private final ChatStreamErrorHandler streamErrorHandler;
    private final CompanionEmotionPublisher companionEmotionPublisher;
    private final SessionTitleWorkflow sessionTitleWorkflow;
    private final MemoryExtractionWorkflow memoryExtractionWorkflow;
    private final SessionCompactionWorkflow sessionCompactionWorkflow;
    private final ProactiveFollowUpWorkflow proactiveFollowUpWorkflow;
    private final XingnaiChatService xingnaiChatService;
    private final HoshiAiProperties hoshiAiProperties;
    private final TransactionTemplate transactionTemplate;
    private final CognitionBackgroundTaskExecutor backgroundTaskExecutor;
    private final MeterRegistry meterRegistry;

    public ChatStreamOrchestrator(
            ChatSessionService chatSessionService,
            ChatMessagePersistenceService persistenceService,
            ChatContextAssembler chatContextAssembler,
            ChatStreamErrorHandler streamErrorHandler,
            CompanionEmotionPublisher companionEmotionPublisher,
            SessionTitleWorkflow sessionTitleWorkflow,
            MemoryExtractionWorkflow memoryExtractionWorkflow,
            SessionCompactionWorkflow sessionCompactionWorkflow,
            ProactiveFollowUpWorkflow proactiveFollowUpWorkflow,
            XingnaiChatService xingnaiChatService,
            HoshiAiProperties hoshiAiProperties,
            PlatformTransactionManager transactionManager,
            CognitionBackgroundTaskExecutor backgroundTaskExecutor,
            ObjectProvider<MeterRegistry> meterRegistryProvider) {
        this.chatSessionService = chatSessionService;
        this.persistenceService = persistenceService;
        this.chatContextAssembler = chatContextAssembler;
        this.streamErrorHandler = streamErrorHandler;
        this.companionEmotionPublisher = companionEmotionPublisher;
        this.sessionTitleWorkflow = sessionTitleWorkflow;
        this.memoryExtractionWorkflow = memoryExtractionWorkflow;
        this.sessionCompactionWorkflow = sessionCompactionWorkflow;
        this.proactiveFollowUpWorkflow = proactiveFollowUpWorkflow;
        this.xingnaiChatService = xingnaiChatService;
        this.hoshiAiProperties = hoshiAiProperties;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
        this.backgroundTaskExecutor = backgroundTaskExecutor;
        this.meterRegistry = meterRegistryProvider.getIfAvailable();
    }

    public void streamAssistantReply(
            User user,
            Long sessionId,
            ChatStreamSink sink,
            String action,
            boolean maybeTitle,
            boolean webSearch,
            ChatStreamPlaybackSettings playback) {
        StreamPlaybackContext playbackContext = StreamPlaybackContext.from(hoshiAiProperties, playback);
        AiChatRequest chatRequest = chatContextAssembler.buildChatRequest(user, sessionId, webSearch);
        StringBuilder assistantContent = new StringBuilder();
        List<AssistantSegment> streamedSegments = new ArrayList<>();
        AtomicReference<CompanionEmotion> carryEmotion = new AtomicReference<>(CompanionEmotion.NORMAL);
        SentenceChunkBuffer sentenceBuffer = new SentenceChunkBuffer(hoshiAiProperties.getMaxSentenceBufferChars());
        Flux<String> stream = resolveAssistantStream(chatRequest, action);
        try {
            stream.doOnNext(delta -> {
                for (String sentence : sentenceBuffer.append(delta)) {
                    streamedSegments.add(processSentence(
                            sink, streamedSegments.size() + 1, sentence, carryEmotion, playbackContext));
                    assistantContent.append(sentence);
                }
            }).blockLast();
        } catch (Exception ex) {
            throw streamErrorHandler.unwrapStreamException(ex);
        }
        for (String sentence : sentenceBuffer.flushRemaining()) {
            streamedSegments.add(processSentence(
                    sink, streamedSegments.size() + 1, sentence, carryEmotion, playbackContext));
            assistantContent.append(sentence);
        }

        String reply = assistantContent.toString().trim();
        if (!StringUtils.hasText(reply)) {
            throw AiServiceException.emptyResponse();
        }

        CompanionEmotion assistantEmotion = streamedSegments.isEmpty()
                ? CompanionEmotion.NORMAL
                : streamedSegments.get(streamedSegments.size() - 1).emotion();
        recordSegmentCount(action, streamedSegments.size());
        ChatMessage assistantMessage = transactionTemplate.execute(status -> {
            ChatSession session = chatSessionService.get(user, sessionId);
            ChatMessage saved = persistenceService.insertMessage(
                    sessionId, ChatMessageRole.ASSISTANT, reply, assistantEmotion.getValue());
            saved.setSegments(persistenceService.insertSegments(saved.getId(), streamedSegments));
            persistenceService.touchSession(session);
            return saved;
        });
        companionEmotionPublisher.publish(
                CompanionEmotion.NORMAL,
                CompanionEventSource.CHAT,
                assistantMessage.getId(),
                null);

        if (maybeTitle) {
            sessionTitleWorkflow.maybeAutoTitle(user, sessionId, sink);
        }

        try {
            sink.emit("done", ChatMessageResponse.from(assistantMessage));
        } catch (IOException ex) {
            throw new StreamClientClosedException(ex);
        }

        if (proactiveFollowUpWorkflow.canRunFollowUp(user, sessionId)) {
            streamFollowUpLoop(user, sessionId, sink, playbackContext);
        }

        CompletableFuture<Void> memoryFuture = backgroundTaskExecutor
                .supplyAsync("memory-extraction", () -> {
                    memoryExtractionWorkflow.runMemoryExtraction(user, sessionId, assistantMessage, sink);
                    return null;
                });

        sessionCompactionWorkflow.triggerPostReplyCompactionAsync(user, sessionId);
        memoryFuture.join();
    }

    private void streamFollowUpLoop(
            User user,
            Long sessionId,
            ChatStreamSink sink,
            StreamPlaybackContext playback) {
        ProactiveFollowUpWorkflow.FollowUpLoopResult result = proactiveFollowUpWorkflow.runFollowUpLoop(
                user,
                sessionId,
                (round, mode, content, source, playbackContext) -> streamFollowUpRound(
                        user, sessionId, sink, round, mode, content, source, playbackContext),
                playback);
        try {
            sink.emit("follow_up_end", new ChatStreamFollowUpEnd(result.totalRounds(), result.endReason()));
        } catch (IOException ex) {
            throw new StreamClientClosedException(ex);
        }
    }

    private ChatMessage streamFollowUpRound(
            User user,
            Long sessionId,
            ChatStreamSink sink,
            int round,
            String mode,
            ProactiveFollowUpContentResult content,
            ChatMessageSource source,
            StreamPlaybackContext playback) throws IOException {
        sink.emit("follow_up_start", new ChatStreamFollowUpStart(round, mode));

        String sentence = content.content().trim();
        AtomicReference<CompanionEmotion> carryEmotion = new AtomicReference<>(CompanionEmotion.NORMAL);
        AssistantSegment segment = processFollowUpSentence(sink, sentence, carryEmotion, playback);

        ChatMessage saved = transactionTemplate.execute(status -> {
            ChatSession session = chatSessionService.get(user, sessionId);
            ChatMessage message = persistenceService.insertProactiveAssistantMessage(
                    sessionId,
                    segment.content(),
                    segment.emotion().getValue(),
                    source);
            message.setSegments(persistenceService.insertSegments(message.getId(), List.of(segment)));
            persistenceService.touchSession(session);
            return message;
        });
        companionEmotionPublisher.publish(
                segment.emotion(),
                CompanionEventSource.CHAT,
                saved.getId(),
                null);
        sink.emit("follow_up_done", ChatMessageResponse.from(saved));
        return saved;
    }

    private AssistantSegment processFollowUpSentence(
            ChatStreamSink sink,
            String sentence,
            AtomicReference<CompanionEmotion> carryEmotion,
            StreamPlaybackContext playback) {
        CompletableFuture<CompanionEmotion> emotionFuture = backgroundTaskExecutor.supplyAsync(
                "emotion-classification",
                () -> resolveSentenceEmotion(sentence));
        emitFollowUpSegmentStart(sink, carryEmotion.get(), sentence.length());
        CompanionEmotion emotion = emotionFuture.join();
        carryEmotion.set(emotion);
        emitFollowUpSegmentEmotion(sink, emotion);
        emitFollowUpSegmentTyping(sink, sentence, playback);
        AssistantSegment segment = new AssistantSegment(1, sentence, emotion);
        emitFollowUpSegmentDone(sink, segment.content(), segment.emotion());
        return segment;
    }

    private void emitFollowUpSegmentStart(ChatStreamSink sink, CompanionEmotion emotion, int contentLength) {
        try {
            sink.emit("follow_up_segment_start", new ChatStreamSegmentStart(
                    1,
                    emotion.getValue(),
                    contentLength));
        } catch (IOException ex) {
            throw new StreamClientClosedException(ex);
        }
    }

    private void emitFollowUpSegmentEmotion(ChatStreamSink sink, CompanionEmotion emotion) {
        try {
            sink.emit("follow_up_segment_emotion", new ChatStreamSegmentEmotion(1, emotion.getValue()));
        } catch (IOException ex) {
            throw new StreamClientClosedException(ex);
        }
    }

    private void emitFollowUpSegmentTyping(ChatStreamSink sink, String sentence, StreamPlaybackContext playback) {
        for (int codePoint : sentence.codePoints().toArray()) {
            emitFollowUpSegmentDelta(sink, new String(Character.toChars(codePoint)));
            paceSentencePlayback(playback.charDelayMs());
        }
    }

    private void emitFollowUpSegmentDelta(ChatStreamSink sink, String delta) {
        try {
            sink.emit("follow_up_segment_delta", new ChatStreamSegmentDelta(1, delta));
        } catch (IOException ex) {
            throw new StreamClientClosedException(ex);
        }
    }

    private void emitFollowUpSegmentDone(ChatStreamSink sink, String content, CompanionEmotion emotion) {
        try {
            sink.emit("follow_up_segment_done", new ChatStreamSegmentDone(
                    1,
                    content,
                    emotion.getValue()));
        } catch (IOException ex) {
            throw new StreamClientClosedException(ex);
        }
    }

    private Flux<String> resolveAssistantStream(AiChatRequest request, String action) {
        String latestUserMessage = chatContextAssembler.findLatestUserMessage(request.context().recentTurns());
        String fixedReply = hoshiAiProperties.findFixedReply(latestUserMessage);
        if (StringUtils.hasText(fixedReply)) {
            recordFixedReply(action);
            return Flux.just(fixedReply);
        }
        return xingnaiChatService.stream(request);
    }

    private void recordSegmentCount(String operation, int segmentCount) {
        if (meterRegistry == null) {
            return;
        }
        DistributionSummary.builder("hoshi.chat.stream.segments")
                .description("Number of assistant segments emitted per chat stream")
                .baseUnit("segments")
                .tag("operation", operation)
                .register(meterRegistry)
                .record(Math.max(segmentCount, 0));
    }

    private void recordFixedReply(String operation) {
        if (meterRegistry == null) {
            return;
        }
        meterRegistry.counter(
                "hoshi.chat.fixed_reply.total",
                "operation", operation)
                .increment();
    }

    private AssistantSegment processSentence(
            ChatStreamSink sink,
            int seq,
            String sentence,
            AtomicReference<CompanionEmotion> carryEmotion,
            StreamPlaybackContext playback) {
        if (seq > 1) {
            paceSentenceGap(playback.gapDelayMs());
        }
        CompletableFuture<CompanionEmotion> emotionFuture = backgroundTaskExecutor.supplyAsync(
                "emotion-classification",
                () -> resolveSentenceEmotion(sentence));
        emitSegmentStart(sink, seq, carryEmotion.get(), sentence.length());
        CompanionEmotion emotion = emotionFuture.join();
        carryEmotion.set(emotion);
        emitSegmentEmotion(sink, seq, emotion);
        companionEmotionPublisher.publish(emotion, CompanionEventSource.CHAT, null, seq);
        emitSegmentTyping(sink, seq, sentence, playback);
        AssistantSegment segment = new AssistantSegment(seq, sentence, emotion);
        emitSegmentDone(sink, segment.seq(), segment.content(), segment.emotion());
        return segment;
    }

    private void emitSegmentTyping(
            ChatStreamSink sink,
            int seq,
            String sentence,
            StreamPlaybackContext playback) {
        for (int codePoint : sentence.codePoints().toArray()) {
            emitSegmentDelta(sink, seq, new String(Character.toChars(codePoint)));
            paceSentencePlayback(playback.charDelayMs());
        }
    }

    private void paceSentencePlayback(int delayMs) {
        sleepPlaybackDelay(delayMs);
    }

    private void paceSentenceGap(int delayMs) {
        sleepPlaybackDelay(delayMs);
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

    private CompanionEmotion resolveSentenceEmotion(String sentence) {
        try {
            String suggested = xingnaiChatService.suggestEmotion(sentence, CompanionEmotion.protocolValues());
            return CompanionEmotion.fromValue(suggested);
        } catch (Exception ex) {
            log.warn("Emotion classification failed, fallback to normal", ex);
            return CompanionEmotion.NORMAL;
        }
    }
}
