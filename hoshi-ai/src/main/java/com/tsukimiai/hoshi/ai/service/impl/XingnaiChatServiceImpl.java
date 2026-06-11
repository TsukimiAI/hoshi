package com.tsukimiai.hoshi.ai.service.impl;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.SystemMessage;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.tsukimiai.hoshi.ai.config.HoshiAiProperties;
import com.tsukimiai.hoshi.ai.model.AiChatTurn;
import com.tsukimiai.hoshi.ai.service.XingnaiChatService;
import com.tsukimiai.hoshi.common.exception.AiServiceException;
import com.tsukimiai.hoshi.common.exception.BusinessException;
import com.tsukimiai.hoshi.common.exception.ErrorCode;

import reactor.core.publisher.Flux;

@Service
public class XingnaiChatServiceImpl implements XingnaiChatService {

    private static final Logger log = LoggerFactory.getLogger(XingnaiChatServiceImpl.class);

    private final ObjectProvider<ChatModel> chatModelProvider;
    private final HoshiAiProperties hoshiAiProperties;

    public XingnaiChatServiceImpl(
            ObjectProvider<ChatModel> chatModelProvider,
            HoshiAiProperties hoshiAiProperties) {
        this.chatModelProvider = chatModelProvider;
        this.hoshiAiProperties = hoshiAiProperties;
    }

    @Override
    public String complete(List<AiChatTurn> history) {
        ChatModel chatModel = requireChatModel();
        Prompt prompt = buildPrompt(history);
        try {
            String reply = chatModel.call(prompt).getResult().getOutput().getText();
            if (!StringUtils.hasText(reply)) {
                throw AiServiceException.emptyResponse();
            }
            return reply.trim();
        } catch (BusinessException ex) {
            throw ex;
        } catch (Exception ex) {
            log.warn("AI completion failed", ex);
            throw AiServiceException.unavailable(ex);
        }
    }

    @Override
    public Flux<String> stream(List<AiChatTurn> history) {
        ChatModel chatModel = requireChatModel();
        Prompt prompt = buildPrompt(history);
        AtomicReference<String> accumulated = new AtomicReference<>("");
        return chatModel.stream(prompt)
                .mapNotNull(chunk -> toDelta(chunk, accumulated))
                .filter(StringUtils::hasText)
                .onErrorMap(ex -> {
                    log.warn("AI stream failed", ex);
                    return AiServiceException.unavailable(ex);
                });
    }

    private ChatModel requireChatModel() {
        ChatModel chatModel = chatModelProvider.getIfAvailable();
        if (chatModel == null) {
            throw AiServiceException.unavailable();
        }
        return chatModel;
    }

    private Prompt buildPrompt(List<AiChatTurn> history) {
        List<Message> messages = new ArrayList<>();
        messages.add(new SystemMessage(hoshiAiProperties.getSystemPrompt()));
        for (AiChatTurn turn : history) {
            if (!StringUtils.hasText(turn.content())) {
                continue;
            }
            if ("user".equalsIgnoreCase(turn.role())) {
                messages.add(new UserMessage(turn.content().trim()));
            } else if ("assistant".equalsIgnoreCase(turn.role())) {
                messages.add(new AssistantMessage(turn.content().trim()));
            }
        }
        if (messages.size() <= 1) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "没有可发送的对话内容");
        }
        return new Prompt(messages);
    }

    private String toDelta(ChatResponse chunk, AtomicReference<String> accumulated) {
        String current = extractChunkText(chunk);
        if (!StringUtils.hasText(current)) {
            return null;
        }

        String previous = accumulated.get();
        String delta;
        if (current.startsWith(previous)) {
            delta = current.substring(previous.length());
            accumulated.set(current);
        } else {
            delta = current;
            accumulated.updateAndGet(existing -> existing + current);
        }
        return StringUtils.hasText(delta) ? delta : null;
    }

    private String extractChunkText(ChatResponse chunk) {
        if (chunk.getResult() != null && chunk.getResult().getOutput() != null) {
            String text = chunk.getResult().getOutput().getText();
            if (StringUtils.hasText(text)) {
                return text;
            }
        }
        StringBuilder builder = new StringBuilder();
        for (Generation generation : chunk.getResults()) {
            if (generation.getOutput() == null) {
                continue;
            }
            String text = generation.getOutput().getText();
            if (StringUtils.hasText(text)) {
                builder.append(text);
            }
        }
        return builder.isEmpty() ? null : builder.toString();
    }
}
