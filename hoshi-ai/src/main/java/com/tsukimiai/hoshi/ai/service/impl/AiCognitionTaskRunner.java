package com.tsukimiai.hoshi.ai.service.impl;

import java.time.Duration;
import java.util.List;

import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.util.StringUtils;

import com.tsukimiai.hoshi.ai.cognition.AiCognitionResult;
import com.tsukimiai.hoshi.ai.cognition.AiCognitionStatus;
import com.tsukimiai.hoshi.ai.cognition.AiCognitionTask;
import com.tsukimiai.hoshi.ai.cognition.EmotionClassificationResult;
import com.tsukimiai.hoshi.ai.cognition.MemoryExtractionResult;
import com.tsukimiai.hoshi.ai.cognition.MemoryReconciliationResult;
import com.tsukimiai.hoshi.ai.cognition.ProactiveFollowUpContentResult;
import com.tsukimiai.hoshi.ai.cognition.ProactiveFollowUpJudgmentResult;
import com.tsukimiai.hoshi.ai.cognition.ProactiveOpeningResult;
import com.tsukimiai.hoshi.ai.cognition.ProactiveTimingJudgmentResult;
import com.tsukimiai.hoshi.ai.cognition.SessionCompactionResult;
import com.tsukimiai.hoshi.ai.cognition.SessionTitleSuggestionResult;

final class AiCognitionTaskRunner {

    private final AiPromptFactory promptFactory;
    private final AiCognitionPayloadParser payloadParser;
    private final AiEmotionSupport emotionSupport;
    private final AiStreamSupport streamSupport;
    private final Duration streamTimeout;

    AiCognitionTaskRunner(
            AiPromptFactory promptFactory,
            AiCognitionPayloadParser payloadParser,
            AiEmotionSupport emotionSupport,
            AiStreamSupport streamSupport,
            Duration streamTimeout) {
        this.promptFactory = promptFactory;
        this.payloadParser = payloadParser;
        this.emotionSupport = emotionSupport;
        this.streamSupport = streamSupport;
        this.streamTimeout = streamTimeout;
    }

    AiCognitionResult run(AiCognitionTask task, ChatModel model, String chatModel) {
        return switch (task.taskType()) {
            case EMOTION_CLASSIFICATION -> runEmotionTask(task, model, chatModel);
            case SESSION_TITLE -> runSessionTitleTask(task, model, chatModel);
            case SESSION_COMPACTION -> runSessionCompactionTask(task, model, chatModel);
            case MEMORY_EXTRACTION -> runMemoryExtractionTask(task, model, chatModel);
            case PROACTIVE_OPENING -> runProactiveOpeningTask(task, model, chatModel);
            case PROACTIVE_TIMING_JUDGMENT -> runProactiveTimingJudgmentTask(task, model, chatModel);
            case PROACTIVE_FOLLOW_UP_JUDGMENT -> runProactiveFollowUpJudgmentTask(task, model, chatModel);
            case PROACTIVE_FOLLOW_UP_CONTENT -> runProactiveFollowUpContentTask(task, model, chatModel);
            case MEMORY_RECONCILIATION -> runMemoryReconciliationTask(task, model, chatModel);
        };
    }

    private AiCognitionResult runEmotionTask(AiCognitionTask task, ChatModel model, String chatModel) {
        List<String> allowed = emotionSupport.readAllowedEmotions(task.input());
        if (allowed.isEmpty()) {
            return new AiCognitionResult(task.taskId(), task.taskType(), AiCognitionStatus.FAILED, chatModel, null, List.of(), null);
        }
        String sentence = emotionSupport.latestTurnContent(task.input());
        Prompt prompt = promptFactory.buildEmotionPrompt(allowed, sentence);
        String raw = model.call(prompt).getResult().getOutput().getText();
        String emotion = emotionSupport.resolveAllowedEmotion(raw, allowed);
        return new AiCognitionResult(
                task.taskId(),
                task.taskType(),
                AiCognitionStatus.SUCCESS,
                promptFactory.resolveEmotionModel(),
                new EmotionClassificationResult(emotion, emotion == null ? 0.0 : 1.0),
                List.of(),
                raw);
    }

    private AiCognitionResult runSessionTitleTask(AiCognitionTask task, ChatModel model, String chatModel) {
        String userMessage = emotionSupport.findTurnContent(task.input(), "user");
        String assistantReply = emotionSupport.findTurnContent(task.input(), "assistant");
        Prompt prompt = promptFactory.buildSessionTitlePrompt(userMessage, assistantReply);
        String raw = model.call(prompt).getResult().getOutput().getText();
        String title = emotionSupport.sanitizeTitle(raw);
        return new AiCognitionResult(
                task.taskId(),
                task.taskType(),
                AiCognitionStatus.SUCCESS,
                chatModel,
                new SessionTitleSuggestionResult(title, title == null ? 0.0 : 1.0),
                List.of(),
                raw);
    }

    private AiCognitionResult runSessionCompactionTask(AiCognitionTask task, ChatModel model, String chatModel) {
        Prompt prompt = promptFactory.buildSessionCompactionPrompt(task.input());
        String raw = model.call(prompt).getResult().getOutput().getText();
        SessionCompactionResult payload = payloadParser.parsePayload(raw, SessionCompactionResult.class);
        return new AiCognitionResult(
                task.taskId(),
                task.taskType(),
                payload == null ? AiCognitionStatus.FAILED : AiCognitionStatus.SUCCESS,
                chatModel,
                payload,
                List.of(),
                raw);
    }

    private AiCognitionResult runMemoryExtractionTask(AiCognitionTask task, ChatModel model, String chatModel) {
        Prompt prompt = promptFactory.buildMemoryExtractionPrompt(task.input());
        String raw = model.call(prompt).getResult().getOutput().getText();
        MemoryExtractionResult payload = payloadParser.parsePayload(raw, MemoryExtractionResult.class);
        return new AiCognitionResult(
                task.taskId(),
                task.taskType(),
                payload == null ? AiCognitionStatus.FAILED : AiCognitionStatus.SUCCESS,
                chatModel,
                payload,
                List.of(),
                raw);
    }

    private AiCognitionResult runMemoryReconciliationTask(AiCognitionTask task, ChatModel model, String chatModel) {
        Prompt prompt = promptFactory.buildMemoryReconciliationPrompt(task.input());
        String raw = model.call(prompt).getResult().getOutput().getText();
        MemoryReconciliationResult payload = payloadParser.parsePayload(raw, MemoryReconciliationResult.class);
        return new AiCognitionResult(
                task.taskId(),
                task.taskType(),
                payload == null ? AiCognitionStatus.FAILED : AiCognitionStatus.SUCCESS,
                promptFactory.resolveEmotionModel(),
                payload,
                List.of(),
                raw);
    }

    private AiCognitionResult runProactiveOpeningTask(AiCognitionTask task, ChatModel model, String chatModel) {
        Prompt prompt = promptFactory.buildProactiveOpeningPrompt(task.input());
        String raw = promptFactory.isProactiveOpeningWebSearchEnabled()
                ? streamSupport.collectText(model, prompt, streamTimeout)
                : model.call(prompt).getResult().getOutput().getText();
        ProactiveOpeningResult payload = payloadParser.parsePayload(raw, ProactiveOpeningResult.class);
        if (payload != null && payload.content() != null) {
            String emotion = payload.emotion() == null ? "normal" : payload.emotion().trim();
            payload = new ProactiveOpeningResult(payload.content().trim(), emotion, payload.confidence());
        }
        return new AiCognitionResult(
                task.taskId(),
                task.taskType(),
                payload == null || !StringUtils.hasText(payload.content())
                        ? AiCognitionStatus.FAILED
                        : AiCognitionStatus.SUCCESS,
                chatModel,
                payload,
                List.of(),
                raw);
    }

    private AiCognitionResult runProactiveTimingJudgmentTask(AiCognitionTask task, ChatModel model, String chatModel) {
        Prompt prompt = promptFactory.buildProactiveTimingJudgmentPrompt(task.input());
        String raw = model.call(prompt).getResult().getOutput().getText();
        ProactiveTimingJudgmentResult payload = payloadParser.parsePayload(raw, ProactiveTimingJudgmentResult.class);
        return new AiCognitionResult(
                task.taskId(),
                task.taskType(),
                payload == null ? AiCognitionStatus.FAILED : AiCognitionStatus.SUCCESS,
                promptFactory.resolveProactiveJudgmentModel(),
                payload,
                List.of(),
                raw);
    }

    private AiCognitionResult runProactiveFollowUpJudgmentTask(AiCognitionTask task, ChatModel model, String chatModel) {
        Prompt prompt = promptFactory.buildProactiveFollowUpJudgmentPrompt(task.input());
        String raw = model.call(prompt).getResult().getOutput().getText();
        ProactiveFollowUpJudgmentResult payload = payloadParser.parsePayload(raw, ProactiveFollowUpJudgmentResult.class);
        return new AiCognitionResult(
                task.taskId(),
                task.taskType(),
                payload == null ? AiCognitionStatus.FAILED : AiCognitionStatus.SUCCESS,
                promptFactory.resolveProactiveJudgmentModel(),
                payload,
                List.of(),
                raw);
    }

    private AiCognitionResult runProactiveFollowUpContentTask(AiCognitionTask task, ChatModel model, String chatModel) {
        Prompt prompt = promptFactory.buildProactiveFollowUpContentPrompt(task.input());
        String raw = model.call(prompt).getResult().getOutput().getText();
        ProactiveFollowUpContentResult payload = payloadParser.parsePayload(raw, ProactiveFollowUpContentResult.class);
        if (payload != null && payload.content() != null) {
            String emotion = payload.emotion() == null ? "normal" : payload.emotion().trim();
            payload = new ProactiveFollowUpContentResult(payload.content().trim(), emotion, payload.confidence());
        }
        return new AiCognitionResult(
                task.taskId(),
                task.taskType(),
                payload == null || !StringUtils.hasText(payload.content())
                        ? AiCognitionStatus.FAILED
                        : AiCognitionStatus.SUCCESS,
                chatModel,
                payload,
                List.of(),
                raw);
    }
}
