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

    private static final String REPLY = "你好，我是星奈。测试回复。";
    private static final List<String> STREAM_PARTS = List.of("你好", "，", "我是星奈", "。", "测试回复。");

    @Bean
    @Primary
    ChatModel mockChatModel() {
        return new ChatModel() {
            @Override
            public ChatResponse call(Prompt prompt) {
                return new ChatResponse(List.of(new Generation(new AssistantMessage(REPLY))));
            }

            @Override
            public Flux<ChatResponse> stream(Prompt prompt) {
                return Flux.fromIterable(STREAM_PARTS)
                        .map(part -> new ChatResponse(List.of(new Generation(new AssistantMessage(part)))));
            }
        };
    }
}
