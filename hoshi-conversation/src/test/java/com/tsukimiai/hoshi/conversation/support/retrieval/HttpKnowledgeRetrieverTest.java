package com.tsukimiai.hoshi.conversation.support.retrieval;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.tsukimiai.hoshi.ai.config.HoshiAiRagProperties;
import com.tsukimiai.hoshi.skill.api.knowledge.KnowledgeChunkPayload;
import com.tsukimiai.hoshi.skill.api.knowledge.KnowledgeRetrieveResponse;

@ExtendWith(MockitoExtension.class)
class HttpKnowledgeRetrieverTest {

    @Mock
    private KnowledgeSkillClient knowledgeSkillClient;

    private HoshiAiRagProperties ragProperties;
    private HttpKnowledgeRetriever retriever;

    @BeforeEach
    void setUp() {
        ragProperties = new HoshiAiRagProperties();
        ragProperties.setKnowledgeTopK(8);
        ragProperties.setKnowledgeMinScore(0.6);
        retriever = new HttpKnowledgeRetriever(knowledgeSkillClient, ragProperties);
    }

    @Test
    void retrieveMapsChunksFromSkillResponse() {
        when(knowledgeSkillClient.retrieve(any())).thenReturn(new KnowledgeRetrieveResponse(List.of(
                new KnowledgeChunkPayload("笔记", "可以用分层方式组织项目。", "kb:1", 0.82, "笔记 > 结构", "content"),
                new KnowledgeChunkPayload("空内容", "   ", "kb:3", 0.9, null, null))));

        var chunks = retriever.retrieve(1L, "Spring Boot", List.of(), 400);

        assertThat(chunks).hasSize(1);
        assertThat(chunks.get(0).title()).isEqualTo("笔记");
        assertThat(chunks.get(0).source()).isEqualTo("kb:1");
    }

    @Test
    void retrieveReturnsEmptyWhenClientFails() {
        when(knowledgeSkillClient.retrieve(any())).thenThrow(new KnowledgeSkillClientException("down", new RuntimeException("io")));

        assertThat(retriever.retrieve(1L, "Spring Boot", List.of(), 400)).isEmpty();
    }

    @Test
    void retrieveDoesNotTrimChunksAgain() {
        when(knowledgeSkillClient.retrieve(any())).thenReturn(new KnowledgeRetrieveResponse(List.of(
                new KnowledgeChunkPayload("A", "第一段", "kb:1", 0.9, null, null),
                new KnowledgeChunkPayload("B", "第二段", "kb:2", 0.9, null, null))));

        var chunks = retriever.retrieve(1L, "query", List.of(), 10);

        assertThat(chunks).hasSize(2);
    }
}
