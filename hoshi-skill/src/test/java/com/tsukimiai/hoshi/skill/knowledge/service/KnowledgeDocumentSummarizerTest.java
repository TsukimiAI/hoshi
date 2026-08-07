package com.tsukimiai.hoshi.skill.knowledge.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.beans.factory.ObjectProvider;

import com.tsukimiai.hoshi.skill.knowledge.config.KnowledgeChunkProperties;

@ExtendWith(MockitoExtension.class)
class KnowledgeDocumentSummarizerTest {

    @Mock
    private ObjectProvider<ChatModel> chatModelProvider;

    @Mock
    private ChatModel chatModel;

    private KnowledgeChunkProperties properties;
    private KnowledgeDocumentSummarizer summarizer;

    @BeforeEach
    void setUp() {
        properties = new KnowledgeChunkProperties();
        summarizer = new KnowledgeDocumentSummarizer(chatModelProvider, properties);
    }

    @Test
    void summarizeUsesChatModelWhenAvailable() {
        when(chatModelProvider.getIfAvailable()).thenReturn(chatModel);
        when(chatModel.call(any(Prompt.class))).thenReturn(new ChatResponse(
                List.of(new Generation(new AssistantMessage("这是结构化摘要。")))));

        String summary = summarizer.summarize("面试知识梳理", "正文", List.of("Java > 集合", "Redis > 持久化"));

        assertThat(summary).contains("结构化摘要");
    }

    @Test
    void summarizeFallsBackToOutlineWhenModelFails() {
        when(chatModelProvider.getIfAvailable()).thenReturn(chatModel);
        when(chatModel.call(any(Prompt.class))).thenThrow(new RuntimeException("down"));

        String summary = summarizer.summarize("面试知识梳理", "正文", List.of("Java > 集合"));

        assertThat(summary).contains("大纲摘要");
        assertThat(summary).contains("Java > 集合");
    }

    @Test
    void summarizeUsesOutlineWhenDisabled() {
        properties.getSummary().setEnabled(false);

        String summary = summarizer.summarize("面试知识梳理", "正文", List.of("Redis"));

        assertThat(summary).contains("章节");
        assertThat(summary).contains("Redis");
    }
}
