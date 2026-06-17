package com.tsukimiai.hoshi.ai.service.impl;

import java.time.Duration;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.prompt.Prompt;

import reactor.core.publisher.Flux;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AiStreamSupportTest {

    @Test
    void collectAccumulatesStreamingChunksAndReturnsLastResponse() {
        ChatModel model = mock(ChatModel.class);
        ChatResponse first = new ChatResponse(List.of(new Generation(new AssistantMessage("{\"content\":\"你好"))));
        ChatResponse last = new ChatResponse(List.of(new Generation(new AssistantMessage("{\"content\":\"你好呀\""))));
        when(model.stream(any(Prompt.class))).thenReturn(Flux.just(first, last));

        AiStreamSupport.CollectedStream collected = new AiStreamSupport().collect(model, new Prompt("test"), Duration.ofSeconds(5));

        assertThat(collected.text()).isEqualTo("{\"content\":\"你好呀\"");
        assertThat(collected.lastResponse()).isSameAs(last);
    }
}
