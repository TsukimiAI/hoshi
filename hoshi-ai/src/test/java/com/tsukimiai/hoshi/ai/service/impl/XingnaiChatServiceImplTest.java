package com.tsukimiai.hoshi.ai.service.impl;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.beans.factory.ObjectProvider;

import com.tsukimiai.hoshi.ai.config.HoshiAiProperties;

import org.springframework.ai.openai.OpenAiChatOptions;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class XingnaiChatServiceImplTest {

    private ChatModel chatModel;
    @SuppressWarnings("rawtypes")
    private ObjectProvider chatModelProvider;
    private XingnaiChatServiceImpl service;

    @BeforeEach
    void setUp() {
        chatModel = mock(ChatModel.class);
        chatModelProvider = mock(ObjectProvider.class);
        when(chatModelProvider.getIfAvailable()).thenReturn(chatModel);
        service = new XingnaiChatServiceImpl(chatModelProvider, new HoshiAiProperties(), "qwen-plus");
    }

    @Test
    void codeLikeSentenceFallsBackToNormalWithoutCallingModel() {
        String emotion = service.suggestEmotion(
                """
                ```java
                List<String> names = list.stream().map(String::trim).toList();
                ```
                """,
                List.of("normal", "happy", "confused"));

        assertThat(emotion).isEqualTo("normal");
        verify(chatModel, never()).call(any(Prompt.class));
    }

    @Test
    void chineseEmotionLabelIsMappedToProtocolValue() {
        when(chatModel.call(any(Prompt.class))).thenReturn(
                new ChatResponse(List.of(new Generation(new AssistantMessage("害羞")))));

        String emotion = service.suggestEmotion(
                "你突然说什么呢！",
                List.of("normal", "shy", "happy"));

        assertThat(emotion).isEqualTo("shy");
    }

    @Test
    void naturalSentenceStillUsesModelClassification() {
        when(chatModel.call(any(Prompt.class))).thenReturn(
                new ChatResponse(List.of(new Generation(new AssistantMessage("happy")))));

        String emotion = service.suggestEmotion(
                "太好了，我们现在就出发吧。",
                List.of("normal", "happy", "confused"));

        assertThat(emotion).isEqualTo("happy");
        verify(chatModel).call(any(Prompt.class));
    }

    @Test
    void emotionClassificationUsesConfiguredEmotionModelAndSentenceOnlyUserMessage() {
        HoshiAiProperties properties = new HoshiAiProperties();
        properties.setEmotionModel("qwen-turbo");
        service = new XingnaiChatServiceImpl(chatModelProvider, properties, "qwen3.5-plus");

        Prompt[] captured = new Prompt[1];
        when(chatModel.call(any(Prompt.class))).thenAnswer(invocation -> {
            captured[0] = invocation.getArgument(0);
            return new ChatResponse(List.of(new Generation(new AssistantMessage("happy"))));
        });

        service.suggestEmotion("太好了，我们现在就出发吧。", List.of("normal", "happy"));

        assertThat(captured[0]).isNotNull();
        assertThat(((OpenAiChatOptions) captured[0].getOptions()).getModel()).isEqualTo("qwen-turbo");
        assertThat(captured[0].getInstructions().get(0).getText()).contains("normal,happy");
        assertThat(captured[0].getInstructions().get(1).getText()).isEqualTo("太好了，我们现在就出发吧。");
    }

    @Test
    void kaomojiSentenceIsNotForcedToNormalWithoutCallingModel() {
        when(chatModel.call(any(Prompt.class))).thenReturn(
                new ChatResponse(List.of(new Generation(new AssistantMessage("happy")))));

        String emotion = service.suggestEmotion(
                "不过我也喜欢你啦～(≧▽≦)。",
                List.of("normal", "happy", "shy"));

        assertThat(emotion).isEqualTo("happy");
        verify(chatModel).call(any(Prompt.class));
    }
}
