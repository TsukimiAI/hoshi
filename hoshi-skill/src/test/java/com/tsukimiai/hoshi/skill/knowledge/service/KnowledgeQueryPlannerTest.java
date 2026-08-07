package com.tsukimiai.hoshi.skill.knowledge.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.tsukimiai.hoshi.skill.api.knowledge.KnowledgeRetrievalIntents;
import com.tsukimiai.hoshi.skill.knowledge.config.KnowledgeChunkProperties;
import com.tsukimiai.hoshi.skill.knowledge.entity.KnowledgeDocument;
import com.tsukimiai.hoshi.skill.knowledge.entity.KnowledgeDocumentStatus;

@ExtendWith(MockitoExtension.class)
class KnowledgeQueryPlannerTest {

    @Mock
    private KnowledgeDocumentService documentService;

    private KnowledgeQueryPlanner planner;

    @BeforeEach
    void setUp() {
        planner = new KnowledgeQueryPlanner(documentService, new KnowledgeChunkProperties());
    }

    @Test
    void detectsSummaryIntent() {
        when(documentService.list(1L, 200)).thenReturn(List.of(readyDoc(1L, "面试知识梳理.md")));

        RetrievalPlan plan = planner.plan(1L, "请总结我的面试知识梳理文档");

        assertThat(plan.intent()).isEqualTo(KnowledgeRetrievalIntents.DOCUMENT_SUMMARY);
        assertThat(plan.lockedDocumentId()).isEqualTo(1L);
        assertThat(plan.queries()).contains("请总结我的面试知识梳理文档");
        assertThat(plan.queries()).anyMatch(query -> query.contains("文档摘要"));
    }

    @Test
    void locksDocumentByFilenameMatch() {
        when(documentService.list(1L, 200)).thenReturn(List.of(
                readyDoc(1L, "面试知识梳理.md"),
                readyDoc(2L, "Redis笔记.md")));

        RetrievalPlan plan = planner.plan(1L, "帮我看 Redis笔记 里的持久化");

        assertThat(plan.intent()).isEqualTo(KnowledgeRetrievalIntents.DOCUMENT_SCOPED);
        assertThat(plan.lockedDocumentId()).isEqualTo(2L);
    }

    @Test
    void doesNotLockWhenMultipleDocsAndNoFilenameHit() {
        when(documentService.list(1L, 200)).thenReturn(List.of(
                readyDoc(1L, "spring-cloud.md"),
                readyDoc(2L, "database-notes.md")));

        RetrievalPlan plan = planner.plan(1L, "Spring Boot 自动配置原理");

        assertThat(plan.intent()).isEqualTo(KnowledgeRetrievalIntents.QA);
        assertThat(plan.lockedDocumentId()).isNull();
        assertThat(plan.queries()).containsExactly("Spring Boot 自动配置原理");
    }

    @Test
    void locksDocumentFromConversationContextForFollowUp() {
        when(documentService.list(1L, 200)).thenReturn(List.of(readyDoc(1L, "面试知识梳理.md")));

        RetrievalPlan plan = planner.plan(
                1L,
                "其中对于AI的部分有没有错误",
                List.of("请总结我的面试知识梳理文档"));

        assertThat(plan.lockedDocumentId()).isEqualTo(1L);
        assertThat(plan.intent()).isEqualTo(KnowledgeRetrievalIntents.DOCUMENT_SCOPED);
        assertThat(plan.queries()).anyMatch(query -> query.contains("AI"));
    }

    private KnowledgeDocument readyDoc(Long id, String filename) {
        KnowledgeDocument doc = new KnowledgeDocument();
        doc.setId(id);
        doc.setFilename(filename);
        doc.setStatus(KnowledgeDocumentStatus.READY.name());
        return doc;
    }
}
