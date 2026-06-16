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

import com.tsukimiai.hoshi.ai.cognition.ProactiveOpeningResult;
import com.tsukimiai.hoshi.ai.cognition.AiCognitionInput;
import com.tsukimiai.hoshi.ai.cognition.AiCognitionTask;
import com.tsukimiai.hoshi.ai.cognition.AiCognitionTaskType;
import com.tsukimiai.hoshi.ai.cognition.MemoryExtractionResult;
import com.tsukimiai.hoshi.ai.cognition.SessionCompactionResult;
import com.tsukimiai.hoshi.ai.config.HoshiAiProperties;
import com.tsukimiai.hoshi.ai.model.AiChatTurn;

import reactor.core.publisher.Flux;

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

    @Test
    void memoryExtractionTaskParsesStructuredJson() {
        when(chatModel.call(any(Prompt.class))).thenReturn(
                new ChatResponse(List.of(new Generation(new AssistantMessage("""
                        {"memories":[{"content":"老师最近在准备 Java 面试","memoryType":"short","category":"temporary_goal","temporalScope":"recent","confidence":0.91,"importance":0.72,"reason":"近期目标","evidence":{"turnRole":"user","excerpt":"我最近在准备 Java 面试"}}]}
                        """)))));

        var result = service.runCognitionTask(new AiCognitionTask(
                null,
                AiCognitionTaskType.MEMORY_EXTRACTION,
                1L,
                2L,
                "assistant_reply_persisted",
                new AiCognitionInput(List.of(new AiChatTurn("user", "我最近在准备 Java 面试")), null, java.util.Map.of())));

        assertThat(result.result()).isInstanceOf(MemoryExtractionResult.class);
        MemoryExtractionResult payload = (MemoryExtractionResult) result.result();
        assertThat(payload.memories()).hasSize(1);
        assertThat(payload.memories().get(0).category()).isEqualTo("temporary_goal");
    }

    @Test
    void sessionCompactionTaskParsesStructuredJson() {
        when(chatModel.call(any(Prompt.class))).thenReturn(
                new ChatResponse(List.of(new Generation(new AssistantMessage("""
                        {"summaryVersion":2,"compressedUntilMessageId":12,"summaryText":"聊过面试准备。","facts":["老师最近在准备面试"],"decisions":["先整理项目经历"],"openLoops":["补自我介绍"],"staleItems":[]}
                        """)))));

        var result = service.runCognitionTask(new AiCognitionTask(
                null,
                AiCognitionTaskType.SESSION_COMPACTION,
                1L,
                2L,
                "context_budget_threshold",
                new AiCognitionInput(List.of(new AiChatTurn("user", "帮我整理一下面试思路")), null, java.util.Map.of())));

        assertThat(result.result()).isInstanceOf(SessionCompactionResult.class);
        SessionCompactionResult payload = (SessionCompactionResult) result.result();
        assertThat(payload.summaryText()).contains("面试准备");
        assertThat(payload.facts()).contains("老师最近在准备面试");
    }

    @Test
    void proactiveOpeningWithWebSearchUsesStreamingCall() {
        HoshiAiProperties properties = new HoshiAiProperties();
        properties.setProactiveOpeningWebSearchEnabled(true);
        service = new XingnaiChatServiceImpl(chatModelProvider, properties, "qwen3.7-max");

        when(chatModel.stream(any(Prompt.class))).thenReturn(Flux.just(
                new ChatResponse(List.of(new Generation(new AssistantMessage(
                        "{\"content\":\"老师～今天天气挺舒服的\",\"emotion\":\"happy\",\"confidence\":0.9}"))))));

        var result = service.runCognitionTask(new AiCognitionTask(
                null,
                AiCognitionTaskType.PROACTIVE_OPENING,
                1L,
                2L,
                "memory:1",
                new AiCognitionInput(
                        List.of(),
                        null,
                        java.util.Map.of(
                                "sourceType", "memory",
                                "memoryCategory", "mood",
                                "hint", "老师最近有点累"))));

        assertThat(result.result()).isInstanceOf(ProactiveOpeningResult.class);
        assertThat(((ProactiveOpeningResult) result.result()).content()).contains("天气");
        verify(chatModel, never()).call(any(Prompt.class));
        verify(chatModel).stream(any(Prompt.class));
    }
}
