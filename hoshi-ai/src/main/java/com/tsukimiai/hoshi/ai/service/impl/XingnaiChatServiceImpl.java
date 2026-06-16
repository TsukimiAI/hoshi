package com.tsukimiai.hoshi.ai.service.impl;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.tsukimiai.hoshi.ai.cognition.AiCognitionInput;
import com.tsukimiai.hoshi.ai.cognition.AiCognitionResult;
import com.tsukimiai.hoshi.ai.cognition.AiCognitionStatus;
import com.tsukimiai.hoshi.ai.cognition.AiCognitionTask;
import com.tsukimiai.hoshi.ai.cognition.AiCognitionTaskType;
import com.tsukimiai.hoshi.ai.cognition.EmotionClassificationResult;
import com.tsukimiai.hoshi.ai.cognition.SessionTitleSuggestionResult;
import com.tsukimiai.hoshi.ai.config.HoshiAiProperties;
import com.tsukimiai.hoshi.ai.model.AiChatContext;
import com.tsukimiai.hoshi.ai.model.AiChatRequest;
import com.tsukimiai.hoshi.ai.model.AiChatTurn;
import com.tsukimiai.hoshi.ai.service.XingnaiChatService;
import com.tsukimiai.hoshi.common.exception.AiServiceException;

import reactor.core.publisher.Flux;

@Service
public class XingnaiChatServiceImpl implements XingnaiChatService {

    private static final Logger log = LoggerFactory.getLogger(XingnaiChatServiceImpl.class);
    private static final Duration STREAM_TIMEOUT = Duration.ofMinutes(2);

    private final ObjectProvider<ChatModel> chatModelProvider;
    private final HoshiAiProperties hoshiAiProperties;
    private final String chatModel;
    private final AiPromptFactory promptFactory;
    private final AiCognitionPayloadParser payloadParser;
    private final AiEmotionSupport emotionSupport;
    private final AiStreamSupport streamSupport;
    private final AiCognitionTaskRunner cognitionTaskRunner;

    public XingnaiChatServiceImpl(
            ObjectProvider<ChatModel> chatModelProvider,
            HoshiAiProperties hoshiAiProperties,
            @Value("${spring.ai.openai.chat.model:qwen-plus}") String chatModel) {
        this.chatModelProvider = chatModelProvider;
        this.hoshiAiProperties = hoshiAiProperties;
        this.chatModel = chatModel;
        this.promptFactory = new AiPromptFactory(hoshiAiProperties, chatModel);
        this.payloadParser = new AiCognitionPayloadParser();
        this.emotionSupport = new AiEmotionSupport();
        this.streamSupport = new AiStreamSupport();
        this.cognitionTaskRunner = new AiCognitionTaskRunner(
                promptFactory, payloadParser, emotionSupport, streamSupport, STREAM_TIMEOUT);
    }

    @Override
    public String complete(List<AiChatTurn> history) {
        return complete(toRequest(history, false));
    }

    @Override
    public String complete(AiChatRequest request) {
        ChatModel model = requireChatModel();
        Prompt prompt = promptFactory.buildChatPrompt(request);
        try {
            String reply = model.call(prompt).getResult().getOutput().getText();
            if (!StringUtils.hasText(reply)) {
                throw AiServiceException.emptyResponse();
            }
            return reply.trim();
        } catch (Exception ex) {
            log.warn("AI completion failed", ex);
            throw AiServiceException.unavailable(ex);
        }
    }

    @Override
    public Flux<String> stream(List<AiChatTurn> history) {
        return stream(history, false);
    }

    @Override
    public Flux<String> stream(List<AiChatTurn> history, boolean webSearch) {
        return stream(toRequest(history, webSearch));
    }

    @Override
    public Flux<String> stream(AiChatRequest request) {
        ChatModel model = requireChatModel();
        Prompt prompt = promptFactory.buildChatPrompt(request);
        AtomicReference<String> accumulated = new AtomicReference<>("");
        return model.stream(prompt)
                .timeout(STREAM_TIMEOUT)
                .mapNotNull(chunk -> streamSupport.toDelta(chunk, accumulated))
                .filter(StringUtils::hasText)
                .onErrorMap(ex -> {
                    log.warn("AI stream failed: {}", streamSupport.rootCauseMessage(ex), ex);
                    return AiServiceException.unavailable(ex);
                });
    }

    @Override
    public String suggestSessionTitle(String userMessage, String assistantReply) {
        AiCognitionTask task = new AiCognitionTask(
                null,
                AiCognitionTaskType.SESSION_TITLE,
                null,
                null,
                "session_title_request",
                new AiCognitionInput(
                        List.of(
                                new AiChatTurn("user", userMessage),
                                new AiChatTurn("assistant", assistantReply)),
                        null,
                        Map.of()));
        AiCognitionResult result = runCognitionTask(task);
        if (result.result() instanceof SessionTitleSuggestionResult payload) {
            return payload.title();
        }
        return null;
    }

    @Override
    public String suggestEmotion(String assistantReply, List<String> allowedEmotions) {
        if (!StringUtils.hasText(assistantReply) || allowedEmotions == null || allowedEmotions.isEmpty()) {
            return null;
        }
        if (emotionSupport.looksLikeCodeContent(assistantReply) && allowedEmotions.contains("normal")) {
            return "normal";
        }
        AiCognitionTask task = new AiCognitionTask(
                null,
                AiCognitionTaskType.EMOTION_CLASSIFICATION,
                null,
                null,
                "assistant_sentence_emotion",
                new AiCognitionInput(
                        List.of(new AiChatTurn("assistant", assistantReply)),
                        null,
                        Map.of("allowedEmotions", allowedEmotions)));
        AiCognitionResult result = runCognitionTask(task);
        if (result.result() instanceof EmotionClassificationResult payload) {
            return payload.emotion();
        }
        return null;
    }

    @Override
    public AiCognitionResult runCognitionTask(AiCognitionTask task) {
        try {
            return cognitionTaskRunner.run(task, requireChatModel(), chatModel);
        } catch (Exception ex) {
            log.warn("AI cognition task {} failed: {}", task.taskType(), ex.getMessage(), ex);
            return new AiCognitionResult(
                    task.taskId(),
                    task.taskType(),
                    AiCognitionStatus.FAILED,
                    chatModel,
                    null,
                    List.of(ex.getMessage() == null ? ex.toString() : ex.getMessage()),
                    null);
        }
    }

    private ChatModel requireChatModel() {
        ChatModel model = chatModelProvider.getIfAvailable();
        if (model == null) {
            throw AiServiceException.unavailable();
        }
        return model;
    }

    private AiChatRequest toRequest(List<AiChatTurn> history, boolean webSearch) {
        return new AiChatRequest(
                new AiChatContext(history, null, List.of(), List.of(), List.of(), hoshiAiProperties.resolvePromptBudget()),
                webSearch);
    }
}
