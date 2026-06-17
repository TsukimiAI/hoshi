package com.tsukimiai.hoshi.ai.service.impl;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.beans.factory.annotation.Autowired;
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
import com.tsukimiai.hoshi.ai.metrics.AiTokenMetricsRecorder;
import com.tsukimiai.hoshi.ai.metrics.AiPromptTextExtractor;
import com.tsukimiai.hoshi.ai.metrics.AiTokenEstimator;
import com.tsukimiai.hoshi.ai.metrics.AiTokenUsageExtractor;
import com.tsukimiai.hoshi.ai.service.XingnaiChatService;
import com.tsukimiai.hoshi.common.exception.AiServiceException;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.springframework.ai.chat.model.ChatResponse;
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
    private final MeterRegistry meterRegistry;

    @Autowired
    public XingnaiChatServiceImpl(
            ObjectProvider<ChatModel> chatModelProvider,
            HoshiAiProperties hoshiAiProperties,
            @Value("${spring.ai.openai.chat.model:qwen-plus}") String chatModel,
            ObjectProvider<MeterRegistry> meterRegistryProvider) {
        this.chatModelProvider = chatModelProvider;
        this.hoshiAiProperties = hoshiAiProperties;
        this.chatModel = chatModel;
        this.promptFactory = new AiPromptFactory(hoshiAiProperties, chatModel);
        this.payloadParser = new AiCognitionPayloadParser();
        this.emotionSupport = new AiEmotionSupport();
        this.streamSupport = new AiStreamSupport();
        this.cognitionTaskRunner = new AiCognitionTaskRunner(
                promptFactory,
                payloadParser,
                emotionSupport,
                streamSupport,
                STREAM_TIMEOUT,
                meterRegistryProvider == null ? null : meterRegistryProvider.getIfAvailable());
        this.meterRegistry = meterRegistryProvider == null ? null : meterRegistryProvider.getIfAvailable();
    }

    public XingnaiChatServiceImpl(
            ObjectProvider<ChatModel> chatModelProvider,
            HoshiAiProperties hoshiAiProperties,
            String chatModel) {
        this(chatModelProvider, hoshiAiProperties, chatModel, null);
    }

    @Override
    public String complete(List<AiChatTurn> history) {
        return complete(toRequest(history, false));
    }

    @Override
    public String complete(AiChatRequest request) {
        ChatModel model = requireChatModel();
        Prompt prompt = promptFactory.buildChatPrompt(request);
        long startTime = System.nanoTime();
        recordAiRequestStarted("complete", request.webSearchEnabled());
        try {
            ChatResponse response = model.call(prompt);
            String reply = response.getResult().getOutput().getText();
            if (!StringUtils.hasText(reply)) {
                throw AiServiceException.emptyResponse();
            }
            recordTokenUsageChat("complete", request.webSearchEnabled(), prompt, reply, "success", response);
            recordAiRequest("complete", request.webSearchEnabled(), "success", startTime);
            return reply.trim();
        } catch (Exception ex) {
            recordTokenUsageChat("complete", request.webSearchEnabled(), prompt, null, "error", null);
            recordAiRequest("complete", request.webSearchEnabled(), "error", startTime);
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
        AtomicReference<ChatResponse> lastResponse = new AtomicReference<>();
        long startTime = System.nanoTime();
        recordAiRequestStarted("stream", request.webSearchEnabled());
        return model.stream(prompt)
                .timeout(STREAM_TIMEOUT)
                .mapNotNull(chunk -> {
                    lastResponse.set(chunk);
                    return streamSupport.toDelta(chunk, accumulated);
                })
                .filter(StringUtils::hasText)
                .doOnComplete(() -> {
                    recordTokenUsageChat(
                            "stream",
                            request.webSearchEnabled(),
                            prompt,
                            accumulated.get(),
                            "success",
                            lastResponse.get());
                    recordAiRequest("stream", request.webSearchEnabled(), "success", startTime);
                })
                .doOnCancel(() -> {
                    recordTokenUsageChat(
                            "stream",
                            request.webSearchEnabled(),
                            prompt,
                            accumulated.get(),
                            "cancelled",
                            lastResponse.get());
                    recordAiRequest("stream", request.webSearchEnabled(), "cancelled", startTime);
                })
                .doOnError(ex -> {
                    recordTokenUsageChat(
                            "stream",
                            request.webSearchEnabled(),
                            prompt,
                            accumulated.get(),
                            "error",
                            lastResponse.get());
                    recordAiRequest("stream", request.webSearchEnabled(), "error", startTime);
                })
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
        long startTime = System.nanoTime();
        try {
            AiCognitionResult result = cognitionTaskRunner.run(task, requireChatModel(), chatModel);
            recordCognitionTask(task.taskType(), result.status(), startTime);
            return result;
        } catch (Exception ex) {
            log.warn("AI cognition task {} failed: {}", task.taskType(), ex.getMessage(), ex);
            AiCognitionResult result = new AiCognitionResult(
                    task.taskId(),
                    task.taskType(),
                    AiCognitionStatus.FAILED,
                    chatModel,
                    null,
                    List.of(ex.getMessage() == null ? ex.toString() : ex.getMessage()),
                    null);
            recordCognitionTask(task.taskType(), result.status(), startTime);
            return result;
        }
    }

    private void recordAiRequestStarted(String operation, boolean webSearch) {
        if (meterRegistry == null) {
            return;
        }
        meterRegistry.counter(
                "hoshi.ai.requests.total",
                "operation", operation,
                "web_search", Boolean.toString(webSearch))
                .increment();
    }

    private void recordAiRequest(String operation, boolean webSearch, String outcome, long startTime) {
        if (meterRegistry == null) {
            return;
        }
        Timer.builder("hoshi.ai.request.duration")
                .description("Latency of AI chat requests")
                .tag("operation", operation)
                .tag("web_search", Boolean.toString(webSearch))
                .tag("outcome", outcome)
                .register(meterRegistry)
                .record(Duration.ofNanos(System.nanoTime() - startTime));
    }

    private void recordCognitionTask(AiCognitionTaskType taskType, AiCognitionStatus status, long startTime) {
        if (meterRegistry == null) {
            return;
        }
        String taskTypeValue = taskType == null ? "unknown" : taskType.name().toLowerCase();
        String statusValue = status == null ? "unknown" : status.name().toLowerCase();
        meterRegistry.counter(
                "hoshi.ai.cognition.tasks.total",
                "task_type", taskTypeValue,
                "status", statusValue)
                .increment();
        Timer.builder("hoshi.ai.cognition.task.duration")
                .description("Latency of AI cognition tasks")
                .tag("task_type", taskTypeValue)
                .tag("status", statusValue)
                .register(meterRegistry)
                .record(Duration.ofNanos(System.nanoTime() - startTime));
    }

    private void recordTokenUsageChat(
            String operation,
            boolean webSearch,
            Prompt prompt,
            String completionText,
            String outcome,
            ChatResponse response) {
        if (meterRegistry == null) {
            return;
        }
        AiTokenUsageExtractor.AiTokenUsage tokenUsage = AiTokenUsageExtractor.extract(response)
                .orElseGet(() -> {
                    String promptText = AiPromptTextExtractor.extract(prompt);
                    int promptTokens = AiTokenEstimator.estimateTokens(promptText);
                    int completionTokens = AiTokenEstimator.estimateTokens(completionText);
                    return new AiTokenUsageExtractor.AiTokenUsage(
                            promptTokens,
                            completionTokens,
                            promptTokens + completionTokens,
                            "estimated");
                });
        new AiTokenMetricsRecorder(meterRegistry)
                .recordChat(tokenUsage, operation, webSearch, chatModel, outcome);
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
