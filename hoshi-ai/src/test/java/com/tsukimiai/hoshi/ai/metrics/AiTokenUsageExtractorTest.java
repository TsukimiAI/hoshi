package com.tsukimiai.hoshi.ai.metrics;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.metadata.ChatResponseMetadata;
import org.springframework.ai.chat.metadata.Usage;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;

import static org.assertj.core.api.Assertions.assertThat;

class AiTokenUsageExtractorTest {

    @Test
    void extractReturnsEmptyWhenNoMetadataUsage() {
        ChatResponse response = new ChatResponse(List.of(new Generation(new AssistantMessage("ok"))));

        assertThat(AiTokenUsageExtractor.extract(response)).isEmpty();
    }

    @Test
    void extractReturnsActualUsageWhenPresent() {
        Usage usage = new Usage() {
            @Override
            public Integer getPromptTokens() {
                return 10;
            }

            @Override
            public Integer getCompletionTokens() {
                return 7;
            }

            @Override
            public Object getNativeUsage() {
                return null;
            }
        };
        ChatResponseMetadata metadata = ChatResponseMetadata.builder()
                .usage(usage)
                .build();
        ChatResponse response = new ChatResponse(
                List.of(new Generation(new AssistantMessage("ok"))),
                metadata);

        var extracted = AiTokenUsageExtractor.extract(response).orElseThrow();
        assertThat(extracted.source()).isEqualTo("actual");
        assertThat(extracted.promptTokens()).isEqualTo(10);
        assertThat(extracted.completionTokens()).isEqualTo(7);
        assertThat(extracted.totalTokens()).isEqualTo(17);
    }

    @Test
    void extractFallsBackToNativeUsageMapWhenStandardFieldsMissing() {
        Usage usage = new Usage() {
            @Override
            public Integer getPromptTokens() {
                return null;
            }

            @Override
            public Integer getCompletionTokens() {
                return null;
            }

            @Override
            public Integer getTotalTokens() {
                return null;
            }

            @Override
            public Object getNativeUsage() {
                return Map.of(
                        "usage", Map.of(
                                "input_tokens", 12,
                                "output_tokens", 5,
                                "total_tokens", 17));
            }
        };
        ChatResponseMetadata metadata = ChatResponseMetadata.builder()
                .usage(usage)
                .build();
        ChatResponse response = new ChatResponse(
                List.of(new Generation(new AssistantMessage("ok"))),
                metadata);

        var extracted = AiTokenUsageExtractor.extract(response).orElseThrow();
        assertThat(extracted.source()).isEqualTo("actual");
        assertThat(extracted.promptTokens()).isEqualTo(12);
        assertThat(extracted.completionTokens()).isEqualTo(5);
        assertThat(extracted.totalTokens()).isEqualTo(17);
    }

    @Test
    void extractFallsBackToNativeUsageJsonWhenStandardFieldsMissing() {
        Usage usage = new Usage() {
            @Override
            public Integer getPromptTokens() {
                return null;
            }

            @Override
            public Integer getCompletionTokens() {
                return null;
            }

            @Override
            public Integer getTotalTokens() {
                return null;
            }

            @Override
            public Object getNativeUsage() {
                return """
                        {"usage":{"prompt_tokens":9,"completion_tokens":3,"total_tokens":12}}
                        """;
            }
        };
        ChatResponseMetadata metadata = ChatResponseMetadata.builder()
                .usage(usage)
                .build();
        ChatResponse response = new ChatResponse(
                List.of(new Generation(new AssistantMessage("ok"))),
                metadata);

        var extracted = AiTokenUsageExtractor.extract(response).orElseThrow();
        assertThat(extracted.source()).isEqualTo("actual");
        assertThat(extracted.promptTokens()).isEqualTo(9);
        assertThat(extracted.completionTokens()).isEqualTo(3);
        assertThat(extracted.totalTokens()).isEqualTo(12);
    }
}

