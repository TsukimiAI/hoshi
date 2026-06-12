package com.tsukimiai.hoshi.server.support;

import java.util.List;

import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

import reactor.core.publisher.Flux;

@TestConfiguration
public class MockChatModelConfiguration {

    private static final String REPLY = "太好了，我们出发吧。等等，你刚才是说明天吗？";
    private static final String TITLE = "测试会话标题";
    private static final List<String> STREAM_PARTS = List.of("太好了", "，我们出发吧。", "等等", "，你刚才是说明天吗？");

    @Bean
    @Primary
    ChatModel mockChatModel() {
        return new ChatModel() {
            @Override
            public ChatResponse call(Prompt prompt) {
                if (isTitlePrompt(prompt)) {
                    return new ChatResponse(List.of(new Generation(new AssistantMessage(TITLE))));
                }
                if (isEmotionPrompt(prompt)) {
                    return new ChatResponse(List.of(new Generation(new AssistantMessage(resolveEmotion(prompt)))));
                }
                return new ChatResponse(List.of(new Generation(new AssistantMessage(REPLY))));
            }

            @Override
            public Flux<ChatResponse> stream(Prompt prompt) {
                return Flux.fromIterable(STREAM_PARTS)
                        .map(part -> new ChatResponse(List.of(new Generation(new AssistantMessage(part)))));
            }
        };
    }

    private static boolean isTitlePrompt(Prompt prompt) {
        return prompt.getInstructions()
                .stream()
                .anyMatch(message -> message.getText() != null && message.getText().contains("会话标题"));
    }

    private static boolean isEmotionPrompt(Prompt prompt) {
        return prompt.getInstructions()
                .stream()
                .anyMatch(message -> message.getText() != null && message.getText().contains("情绪分类器"));
    }

    private static String resolveEmotion(Prompt prompt) {
        String text = prompt.getInstructions()
                .stream()
                .map(message -> message.getText() == null ? "" : message.getText())
                .reduce("", String::concat);
        if (text.contains("说明天吗")) {
            return "confused";
        }
        return "happy";
    }
}
