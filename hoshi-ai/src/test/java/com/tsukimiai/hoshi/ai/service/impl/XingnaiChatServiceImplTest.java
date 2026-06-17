package com.tsukimiai.hoshi.ai.service.impl;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.metadata.ChatResponseMetadata;
import org.springframework.ai.chat.metadata.Usage;
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
import com.tsukimiai.hoshi.ai.cognition.MemoryReconciliationResult;
import com.tsukimiai.hoshi.ai.cognition.ProactiveFollowUpContentResult;
import com.tsukimiai.hoshi.ai.cognition.ProactiveFollowUpJudgmentResult;
import com.tsukimiai.hoshi.ai.cognition.ProactiveTimingJudgmentResult;
import com.tsukimiai.hoshi.ai.cognition.SessionCompactionResult;
import com.tsukimiai.hoshi.ai.config.HoshiAiProperties;
import com.tsukimiai.hoshi.ai.model.AiChatTurn;

import reactor.core.publisher.Flux;

import org.springframework.ai.openai.OpenAiChatOptions;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

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

    @Test
    @SuppressWarnings("unchecked")
    void completeRecordsMetricsOnSuccess() {
        ObjectProvider meterRegistryProvider = mock(ObjectProvider.class);
        SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
        when(meterRegistryProvider.getIfAvailable()).thenReturn(meterRegistry);
        service = new XingnaiChatServiceImpl(chatModelProvider, new HoshiAiProperties(), "qwen-plus", meterRegistryProvider);
        when(chatModel.call(any(Prompt.class))).thenReturn(
                new ChatResponse(List.of(new Generation(new AssistantMessage("星奈在这里")))));

        String reply = service.complete(List.of(new AiChatTurn("user", "在吗")));

        assertThat(reply).isEqualTo("星奈在这里");
        assertThat(meterRegistry.get("hoshi.ai.requests.total")
                .tag("operation", "complete")
                .tag("web_search", "false")
                .counter()
                .count()).isEqualTo(1.0d);
        assertThat(meterRegistry.get("hoshi.ai.request.duration")
                .tag("operation", "complete")
                .tag("web_search", "false")
                .tag("outcome", "success")
                .timer()
                .count()).isEqualTo(1L);
    }

    @Test
    @SuppressWarnings("unchecked")
    void streamRecordsActualTokenMetricsWhenUsagePresentOnLastChunk() {
        ObjectProvider meterRegistryProvider = mock(ObjectProvider.class);
        SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
        when(meterRegistryProvider.getIfAvailable()).thenReturn(meterRegistry);
        service = new XingnaiChatServiceImpl(chatModelProvider, new HoshiAiProperties(), "qwen-plus", meterRegistryProvider);

        ChatResponse first = new ChatResponse(List.of(new Generation(new AssistantMessage("你"))));
        ChatResponse last = new ChatResponse(
                List.of(new Generation(new AssistantMessage("你好"))),
                ChatResponseMetadata.builder()
                        .usage(new Usage() {
                            @Override
                            public Integer getPromptTokens() {
                                return 11;
                            }

                            @Override
                            public Integer getCompletionTokens() {
                                return 3;
                            }

                            @Override
                            public Object getNativeUsage() {
                                return null;
                            }
                        })
                        .build());
        when(chatModel.stream(any(Prompt.class))).thenReturn(Flux.just(first, last));

        String all = service.stream(List.of(new AiChatTurn("user", "hi")))
                .collectList()
                .block()
                .stream()
                .reduce("", (a, b) -> a + b);

        assertThat(all).contains("你").contains("好");
        assertThat(meterRegistry.get("hoshi.ai.tokens.total")
                .tag("source", "actual")
                .tag("operation", "stream")
                .tag("task_type", "none")
                .tag("model", "qwen-plus")
                .tag("web_search", "false")
                .tag("outcome", "success")
                .counter()
                .count()).isEqualTo(14.0d);
    }

    @Test
    @SuppressWarnings("unchecked")
    void cognitionAllTaskTypesRecordTokenMetrics() {
        ObjectProvider meterRegistryProvider = mock(ObjectProvider.class);
        SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
        when(meterRegistryProvider.getIfAvailable()).thenReturn(meterRegistry);
        HoshiAiProperties properties = new HoshiAiProperties();
        properties.setProactiveOpeningWebSearchEnabled(true);
        service = new XingnaiChatServiceImpl(chatModelProvider, properties, "qwen-plus", meterRegistryProvider);

        ChatResponseMetadata metadata = ChatResponseMetadata.builder()
                .usage(new Usage() {
                    @Override
                    public Integer getPromptTokens() {
                        return 2;
                    }

                    @Override
                    public Integer getCompletionTokens() {
                        return 1;
                    }

                    @Override
                    public Object getNativeUsage() {
                        return null;
                    }
                })
                .build();

        when(chatModel.call(any(Prompt.class))).thenAnswer(invocation -> new ChatResponse(
                List.of(new Generation(new AssistantMessage(safeOutputForTask(invocation.getArgument(0))))),
                metadata));
        when(chatModel.stream(any(Prompt.class))).thenReturn(Flux.just(new ChatResponse(
                List.of(new Generation(new AssistantMessage("{\"content\":\"hi\",\"emotion\":\"happy\",\"confidence\":0.9}"))),
                metadata)));

        for (AiCognitionTaskType type : AiCognitionTaskType.values()) {
            AiCognitionTask task = new AiCognitionTask(
                    null,
                    type,
                    1L,
                    2L,
                    "test",
                    inputForTask(type));
            service.runCognitionTask(task);
        }

        for (AiCognitionTaskType type : AiCognitionTaskType.values()) {
            assertHasCognitionTokenCounter(meterRegistry, type.name().toLowerCase(), 3.0d);
        }
    }

    private static void assertHasCognitionTokenCounter(SimpleMeterRegistry meterRegistry, String taskType, double expectedCount) {
        boolean found = meterRegistry.getMeters()
                .stream()
                .filter(m -> m.getId() != null && "hoshi.ai.tokens.total".equals(m.getId().getName()))
                .filter(m -> m.getId().getType() == io.micrometer.core.instrument.Meter.Type.COUNTER)
                .anyMatch(m -> {
                    var tags = m.getId().getTags();
                    boolean matches = tags.stream().anyMatch(t -> t.getKey().equals("source") && t.getValue().equals("actual"))
                            && tags.stream().anyMatch(t -> t.getKey().equals("operation") && t.getValue().equals("cognition"))
                            && tags.stream().anyMatch(t -> t.getKey().equals("task_type") && t.getValue().equals(taskType))
                            && tags.stream().anyMatch(t -> t.getKey().equals("outcome") && t.getValue().equals("success"));
                    if (!matches) {
                        return false;
                    }
                    io.micrometer.core.instrument.Counter c = (io.micrometer.core.instrument.Counter) m;
                    return c.count() == expectedCount;
                });
        assertThat(found).isTrue();
    }

    private static AiCognitionInput inputForTask(AiCognitionTaskType type) {
        return switch (type) {
            case SESSION_TITLE -> new AiCognitionInput(List.of(
                    new AiChatTurn("user", "u"),
                    new AiChatTurn("assistant", "a")), null, java.util.Map.of());
            case EMOTION_CLASSIFICATION -> new AiCognitionInput(List.of(
                    new AiChatTurn("assistant", "太好了")), null, java.util.Map.of("allowedEmotions", List.of("normal", "happy")));
            case PROACTIVE_OPENING -> new AiCognitionInput(List.of(), null, java.util.Map.of(
                    "sourceType", "memory",
                    "memoryCategory", "mood",
                    "hint", "老师最近有点累"));
            default -> new AiCognitionInput(List.of(new AiChatTurn("user", "老师你好")), null, java.util.Map.of(
                    "allowedEmotions", List.of("normal", "happy")));
        };
    }

    private static String safeOutputForTask(Prompt prompt) {
        // Options include model, but task type isn't directly exposed; return payloads that parse for all tasks.
        // For judgment tasks: payload parser expects JSON with shouldTrigger/shouldContinue.
        // For content tasks: expects JSON with content/emotion.
        // For memory extraction/reconciliation/compaction: expects structured JSON.
        String joined = prompt.getInstructions() == null ? "" : prompt.getInstructions().toString();
        if (joined.contains("追加对话时机判断器") || joined.contains("shouldContinue")) {
            return "{\"shouldContinue\":true,\"mode\":\"continue\",\"reason\":\"ok\",\"confidence\":0.8,\"naturalEnd\":false}";
        }
        if (joined.contains("主动对话时机判断器") || joined.contains("shouldTrigger")) {
            return "{\"shouldTrigger\":true,\"reason\":\"ok\",\"confidence\":0.8}";
        }
        if (joined.contains("追加一句简短") || joined.contains("追加一句")) {
            return "{\"content\":\"老师～\",\"emotion\":\"happy\",\"confidence\":0.9}";
        }
        if (joined.contains("会话压缩器")) {
            return "{\"summaryVersion\":1,\"compressedUntilMessageId\":0,\"summaryText\":\"s\",\"facts\":[],\"decisions\":[],\"openLoops\":[],\"staleItems\":[]}";
        }
        if (joined.contains("用户记忆抽取器")) {
            return "{\"memories\":[{\"content\":\"c\",\"memoryType\":\"short\",\"category\":\"plan\",\"temporalScope\":\"recent\",\"action\":\"create\",\"supersedesContent\":\"\",\"supersedesMemoryId\":0,\"confidence\":0.9,\"importance\":0.7,\"reason\":\"r\",\"evidence\":{\"turnRole\":\"user\",\"excerpt\":\"e\"}}]}";
        }
        if (joined.contains("用户记忆整合器")) {
            return "{\"operations\":[]}";
        }
        if (joined.contains("情绪分类器")) {
            return "happy";
        }
        if (joined.contains("会话标题")) {
            return "标题";
        }
        return "{\"content\":\"hi\",\"emotion\":\"happy\",\"confidence\":0.9}";
    }

    @Test
    @SuppressWarnings("unchecked")
    void cognitionTaskRecordsFailedMetricsWhenModelThrows() {
        ObjectProvider meterRegistryProvider = mock(ObjectProvider.class);
        SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
        when(meterRegistryProvider.getIfAvailable()).thenReturn(meterRegistry);
        service = new XingnaiChatServiceImpl(chatModelProvider, new HoshiAiProperties(), "qwen-plus", meterRegistryProvider);
        when(chatModel.call(any(Prompt.class))).thenThrow(new RuntimeException("boom"));

        var result = service.runCognitionTask(new AiCognitionTask(
                null,
                AiCognitionTaskType.MEMORY_EXTRACTION,
                1L,
                2L,
                "assistant_reply_persisted",
                new AiCognitionInput(List.of(new AiChatTurn("user", "记住这个")), null, java.util.Map.of())));

        assertThat(result.status()).isEqualTo(com.tsukimiai.hoshi.ai.cognition.AiCognitionStatus.FAILED);
        assertThat(meterRegistry.get("hoshi.ai.cognition.tasks.total")
                .tag("task_type", "memory_extraction")
                .tag("status", "failed")
                .counter()
                .count()).isEqualTo(1.0d);
        assertThat(meterRegistry.get("hoshi.ai.cognition.task.duration")
                .tag("task_type", "memory_extraction")
                .tag("status", "failed")
                .timer()
                .count()).isEqualTo(1L);
        assertThat(meterRegistry.get("hoshi.ai.tokens.requests.total")
                .tag("source", "estimated")
                .tag("operation", "cognition")
                .tag("task_type", "memory_extraction")
                .tag("model", "qwen-plus")
                .tag("outcome", "error")
                .counter()
                .count()).isEqualTo(1.0d);
    }
}
