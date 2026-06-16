package com.tsukimiai.hoshi.ai.service.impl;

import java.util.ArrayList;
import java.util.List;

import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.SystemMessage;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.prompt.ChatOptions;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.util.StringUtils;

import com.tsukimiai.hoshi.ai.cognition.AiCognitionInput;
import com.tsukimiai.hoshi.ai.config.HoshiAiProperties;
import com.tsukimiai.hoshi.ai.model.AiChatContext;
import com.tsukimiai.hoshi.ai.model.AiChatRequest;
import com.tsukimiai.hoshi.ai.model.AiChatTurn;
import com.tsukimiai.hoshi.common.exception.BusinessException;
import com.tsukimiai.hoshi.common.exception.ErrorCode;

final class AiPromptFactory {

    private final HoshiAiProperties hoshiAiProperties;
    private final String chatModel;

    AiPromptFactory(HoshiAiProperties hoshiAiProperties, String chatModel) {
        this.hoshiAiProperties = hoshiAiProperties;
        this.chatModel = chatModel;
    }

    Prompt buildChatPrompt(AiChatRequest request) {
        AiChatRequest safeRequest = request == null ? toRequest(List.of(), false) : request;
        AiChatContext context = safeRequest.context();
        List<Message> messages = new ArrayList<>();
        messages.add(new SystemMessage(hoshiAiProperties.buildSystemPrompt(safeRequest.webSearchEnabled(), context)));
        if (context != null) {
            for (AiChatTurn turn : context.recentTurns()) {
                if (!StringUtils.hasText(turn.content())) {
                    continue;
                }
                if ("user".equalsIgnoreCase(turn.role())) {
                    messages.add(new UserMessage(turn.content().trim()));
                } else if ("assistant".equalsIgnoreCase(turn.role())) {
                    messages.add(new AssistantMessage(turn.content().trim()));
                }
            }
        }
        if (messages.size() <= 1) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "没有可发送的对话内容");
        }
        ChatOptions chatOptions = buildWebSearchChatOptions(safeRequest.webSearchEnabled());
        return chatOptions == null ? new Prompt(messages) : new Prompt(messages, chatOptions);
    }

    Prompt buildEmotionPrompt(List<String> allowed, String sentence) {
        return new Prompt(
                List.of(
                        new SystemMessage(hoshiAiProperties.formatEmotionSystemPrompt(String.join(",", allowed))),
                        new UserMessage(sentence)),
                OpenAiChatOptions.builder()
                        .model(hoshiAiProperties.resolveEmotionModel(chatModel))
                        .build());
    }

    Prompt buildSessionTitlePrompt(String userMessage, String assistantReply) {
        return new Prompt(List.of(
                new SystemMessage(hoshiAiProperties.getTitleSystemPrompt()),
                new UserMessage(hoshiAiProperties.formatTitleUserPrompt(userMessage, assistantReply))));
    }

    Prompt buildSessionCompactionPrompt(AiCognitionInput input) {
        return new Prompt(List.of(
                new SystemMessage(hoshiAiProperties.getSessionCompactionSystemPrompt()),
                new UserMessage(hoshiAiProperties.formatSessionCompactionUserPrompt(input))));
    }

    Prompt buildMemoryExtractionPrompt(AiCognitionInput input) {
        return new Prompt(List.of(
                new SystemMessage(hoshiAiProperties.getMemoryExtractionSystemPrompt()),
                new UserMessage(hoshiAiProperties.formatMemoryExtractionUserPrompt(input))));
    }

    Prompt buildMemoryReconciliationPrompt(AiCognitionInput input) {
        return new Prompt(
                List.of(
                        new SystemMessage(hoshiAiProperties.getMemoryReconciliationSystemPrompt()),
                        new UserMessage(hoshiAiProperties.formatMemoryReconciliationUserPrompt(input))),
                OpenAiChatOptions.builder()
                        .model(hoshiAiProperties.resolveEmotionModel(chatModel))
                        .build());
    }

    Prompt buildProactiveOpeningPrompt(AiCognitionInput input) {
        List<Message> messages = List.of(
                new SystemMessage(hoshiAiProperties.buildProactiveOpeningSystemPrompt()),
                new UserMessage(hoshiAiProperties.formatProactiveOpeningUserPrompt(input)));
        if (!hoshiAiProperties.isProactiveOpeningWebSearchEnabled() || !hoshiAiProperties.isWebSearchEnabled()) {
            return new Prompt(messages);
        }
        return new Prompt(
                messages,
                OpenAiChatOptions.builder()
                        .model(chatModel)
                        .extraBody(hoshiAiProperties.buildWebSearchExtraBody(true, chatModel))
                        .build());
    }

    boolean isProactiveOpeningWebSearchEnabled() {
        return hoshiAiProperties.isProactiveOpeningWebSearchEnabled()
                && hoshiAiProperties.isWebSearchEnabled();
    }

    Prompt buildProactiveTimingJudgmentPrompt(AiCognitionInput input) {
        return new Prompt(
                List.of(
                        new SystemMessage(hoshiAiProperties.getProactiveTimingJudgmentSystemPrompt()),
                        new UserMessage(hoshiAiProperties.formatProactiveTimingJudgmentUserPrompt(input))),
                OpenAiChatOptions.builder()
                        .model(hoshiAiProperties.resolveProactiveJudgmentModel(chatModel))
                        .build());
    }

    Prompt buildProactiveFollowUpJudgmentPrompt(AiCognitionInput input) {
        return new Prompt(
                List.of(
                        new SystemMessage(hoshiAiProperties.getProactiveFollowUpJudgmentSystemPrompt()),
                        new UserMessage(hoshiAiProperties.formatProactiveFollowUpJudgmentUserPrompt(input))),
                OpenAiChatOptions.builder()
                        .model(hoshiAiProperties.resolveProactiveJudgmentModel(chatModel))
                        .build());
    }

    Prompt buildProactiveFollowUpContentPrompt(AiCognitionInput input) {
        return new Prompt(List.of(
                new SystemMessage(hoshiAiProperties.getProactiveFollowUpContentSystemPrompt()),
                new UserMessage(hoshiAiProperties.formatProactiveFollowUpContentUserPrompt(input))));
    }

    String resolveProactiveJudgmentModel() {
        return hoshiAiProperties.resolveProactiveJudgmentModel(chatModel);
    }

    String resolveEmotionModel() {
        return hoshiAiProperties.resolveEmotionModel(chatModel);
    }

    private ChatOptions buildWebSearchChatOptions(boolean webSearch) {
        if (!webSearch || !hoshiAiProperties.isWebSearchEnabled()) {
            return null;
        }
        return OpenAiChatOptions.builder()
                .model(chatModel)
                .extraBody(hoshiAiProperties.buildWebSearchExtraBody(webSearch, chatModel))
                .build();
    }

    private AiChatRequest toRequest(List<AiChatTurn> history, boolean webSearch) {
        return new AiChatRequest(
                new AiChatContext(history, null, List.of(), List.of(), List.of(), hoshiAiProperties.resolvePromptBudget()),
                webSearch);
    }
}
