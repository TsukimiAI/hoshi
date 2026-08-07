package com.tsukimiai.hoshi.skill.knowledge.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.ai.document.Document;
import org.springframework.ai.vectorstore.SearchRequest;
import org.springframework.ai.vectorstore.VectorStore;

import com.tsukimiai.hoshi.skill.api.knowledge.KnowledgeChunkKinds;
import com.tsukimiai.hoshi.skill.api.knowledge.KnowledgeRetrievalIntents;
import com.tsukimiai.hoshi.skill.knowledge.config.KnowledgeChunkProperties;

@ExtendWith(MockitoExtension.class)
class HybridKnowledgeRankerTest {

    @Mock
    private VectorStore vectorStore;

    private HybridKnowledgeRanker ranker;

    @BeforeEach
    void setUp() {
        ranker = new HybridKnowledgeRanker(vectorStore, new KnowledgeChunkProperties());
    }

    @Test
    void skipsDocumentSummaryForQaIntent() {
        when(vectorStore.similaritySearch(any(SearchRequest.class))).thenReturn(List.of(
                summaryDoc("1"),
                contentDoc("1", "面试知识梳理 > AI+ > Agent", 27)));

        RetrievalPlan plan = new RetrievalPlan(
                KnowledgeRetrievalIntents.DOCUMENT_SCOPED,
                1L,
                List.of("其中对于AI的笔记有没有错误"));
        var result = ranker.rank(1L, plan, "其中对于AI的笔记有没有错误", 2, 0.0, 4000);

        assertThat(result.chunks()).hasSize(1);
        assertThat(result.chunks().get(0).chunkKind()).isEqualTo(KnowledgeChunkKinds.CONTENT);
        assertThat(result.chunks().get(0).headingPath()).contains("Agent");
    }

    @Test
    void boostsDocumentSummaryChunkForSummaryIntent() {
        when(vectorStore.similaritySearch(any(SearchRequest.class))).thenReturn(List.of(
                contentDoc("1", "Python 基础", 0),
                summaryDoc("1")));

        RetrievalPlan plan = new RetrievalPlan(
                KnowledgeRetrievalIntents.DOCUMENT_SUMMARY,
                1L,
                List.of("总结文档"));
        var result = ranker.rank(1L, plan, "总结文档", 2, 0.0, 4000);

        assertThat(result.chunks()).hasSize(2);
        assertThat(result.chunks().get(0).chunkKind()).isEqualTo(KnowledgeChunkKinds.DOCUMENT_SUMMARY);
    }

    @Test
    void limitsChunksPerSection() {
        KnowledgeChunkProperties properties = new KnowledgeChunkProperties();
        properties.getRetrieve().setMaxChunksPerSection(1);
        ranker = new HybridKnowledgeRanker(vectorStore, properties);
        when(vectorStore.similaritySearch(any(SearchRequest.class))).thenReturn(List.of(
                contentDoc("1", "Redis > 持久化", 0),
                contentDoc("1", "Redis > 持久化", 1),
                contentDoc("1", "Java > 集合", 2)));

        RetrievalPlan plan = new RetrievalPlan(KnowledgeRetrievalIntents.QA, null, List.of("Redis"));
        var result = ranker.rank(1L, plan, "Redis", 5, 0.0, 4000);

        assertThat(result.chunks()).hasSize(2);
        assertThat(result.chunks().stream().map(chunk -> chunk.headingPath()).distinct()).hasSize(2);
    }

    private Document contentDoc(String documentId, String headingPath, int chunkIndex) {
        return Document.builder()
                .text(headingPath + " 内容 " + chunkIndex)
                .metadata(Map.of(
                        "userId", "1",
                        "documentId", documentId,
                        "filename", "notes.md",
                        "chunkIndex", String.valueOf(chunkIndex),
                        "headingPath", headingPath,
                        "sectionIndex", "0",
                        "chunkKind", KnowledgeChunkKinds.CONTENT))
                .score(0.8 - chunkIndex * 0.05)
                .build();
    }

    private Document summaryDoc(String documentId) {
        return Document.builder()
                .text("整篇文档摘要")
                .metadata(Map.of(
                        "userId", "1",
                        "documentId", documentId,
                        "filename", "notes.md",
                        "chunkIndex", "-1",
                        "headingPath", "",
                        "sectionIndex", "-1",
                        "chunkKind", KnowledgeChunkKinds.DOCUMENT_SUMMARY))
                .score(0.75)
                .build();
    }
}
