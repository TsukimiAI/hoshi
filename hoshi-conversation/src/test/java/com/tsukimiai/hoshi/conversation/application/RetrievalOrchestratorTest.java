package com.tsukimiai.hoshi.conversation.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.tsukimiai.hoshi.ai.config.HoshiAiRagProperties;
import com.tsukimiai.hoshi.ai.model.AiKnowledgeChunk;
import com.tsukimiai.hoshi.ai.model.AiMemoryContext;
import com.tsukimiai.hoshi.ai.model.AiPromptBudget;
import com.tsukimiai.hoshi.conversation.config.KnowledgeSkillProperties;
import com.tsukimiai.hoshi.conversation.support.retrieval.KnowledgeRetriever;

@ExtendWith(MockitoExtension.class)
class RetrievalOrchestratorTest {

    @Mock
    private MemoryExtractionWorkflow memoryExtractionWorkflow;
    @Mock
    private KnowledgeRetriever knowledgeRetriever;
    @Mock
    private RetrievalMetrics metrics;

    private HoshiAiRagProperties ragProperties;
    private KnowledgeSkillProperties skillProperties;
    private RetrievalOrchestrator orchestrator;

    @BeforeEach
    void setUp() {
        ragProperties = new HoshiAiRagProperties();
        skillProperties = new KnowledgeSkillProperties();
        orchestrator = new RetrievalOrchestrator(
                memoryExtractionWorkflow,
                knowledgeRetriever,
                ragProperties,
                skillProperties,
                metrics);
    }

    @Test
    void retrieveSkipsKnowledgeWhenRagDisabled() {
        AiPromptBudget budget = new AiPromptBudget(8000, 3600, 1600, 1200, 1200, 400);
        when(memoryExtractionWorkflow.selectShortMemories(1L, "论文", 1200))
                .thenReturn(List.of(new AiMemoryContext("1", "老师在写论文", "short", "current_focus", "ongoing", 0.9, 0.8, 0.8, false)));
        when(memoryExtractionWorkflow.selectLongMemories(1L, "论文", 1200)).thenReturn(List.of());

        RetrievalBundle bundle = orchestrator.retrieve(1L, "论文", budget);

        assertThat(bundle.shortMemories()).hasSize(1);
        assertThat(bundle.knowledgeChunks()).isEmpty();
        verify(metrics).recordSkipped("disabled");
    }

    @Test
    void retrieveLoadsKnowledgeWhenEnabled() {
        ragProperties.setKnowledgeEnabled(true);
        AiPromptBudget budget = new AiPromptBudget(8000, 3600, 1600, 1200, 1200, 400);
        when(memoryExtractionWorkflow.selectShortMemories(1L, "Spring Boot", 1200)).thenReturn(List.of());
        when(memoryExtractionWorkflow.selectLongMemories(1L, "Spring Boot", 1200)).thenReturn(List.of());
        when(knowledgeRetriever.retrieve(eq(1L), eq("Spring Boot"), eq(List.of()), eq(400)))
                .thenReturn(List.of(new AiKnowledgeChunk("笔记", "分层组织项目。", "kb:1")));

        RetrievalBundle bundle = orchestrator.retrieve(1L, "Spring Boot", budget);

        assertThat(bundle.knowledgeChunks()).hasSize(1);
        verify(metrics).recordKnowledgeHits(1);
        verify(metrics).recordRetrievalDuration(org.mockito.ArgumentMatchers.anyLong());
    }

    @Test
    void retrieveLoadsKnowledgeWhenLegacySkillEnabled() {
        skillProperties.setEnabled(true);
        AiPromptBudget budget = new AiPromptBudget(8000, 3600, 1600, 1200, 1200, 400);
        when(memoryExtractionWorkflow.selectShortMemories(1L, "Spring Boot", 1200)).thenReturn(List.of());
        when(memoryExtractionWorkflow.selectLongMemories(1L, "Spring Boot", 1200)).thenReturn(List.of());
        when(knowledgeRetriever.retrieve(eq(1L), eq("Spring Boot"), eq(List.of()), eq(400)))
                .thenReturn(List.of(new AiKnowledgeChunk("笔记", "分层组织项目。", "kb:1")));

        RetrievalBundle bundle = orchestrator.retrieve(1L, "Spring Boot", budget);

        assertThat(bundle.knowledgeChunks()).hasSize(1);
    }

    @Test
    void retrieveUsesSummaryBudgetWhenQueryIsSummaryLike() {
        ragProperties.setKnowledgeEnabled(true);
        ragProperties.setKnowledgeBudgetTokens(800);
        ragProperties.setKnowledgeSummaryBudgetTokens(2400);
        AiPromptBudget budget = new AiPromptBudget(8000, 3600, 1600, 1200, 1200, 400);
        when(memoryExtractionWorkflow.selectShortMemories(1L, "总结文档", 1200)).thenReturn(List.of());
        when(memoryExtractionWorkflow.selectLongMemories(1L, "总结文档", 1200)).thenReturn(List.of());
        when(knowledgeRetriever.retrieve(eq(1L), eq("总结文档"), eq(List.of()), eq(2400)))
                .thenReturn(List.of(new AiKnowledgeChunk("笔记", "摘要内容", "kb:1")));

        RetrievalBundle bundle = orchestrator.retrieve(1L, "总结文档", budget);

        assertThat(bundle.knowledgeChunks()).hasSize(1);
    }

    @Test
    void retrieveDegradesWhenKnowledgeRetrieverThrows() {
        ragProperties.setKnowledgeEnabled(true);
        AiPromptBudget budget = new AiPromptBudget(8000, 3600, 1600, 1200, 1200, 400);
        when(memoryExtractionWorkflow.selectShortMemories(1L, "Spring Boot", 1200)).thenReturn(List.of());
        when(memoryExtractionWorkflow.selectLongMemories(1L, "Spring Boot", 1200)).thenReturn(List.of());
        when(knowledgeRetriever.retrieve(eq(1L), eq("Spring Boot"), eq(List.of()), eq(400)))
                .thenThrow(new RuntimeException("skill down"));

        RetrievalBundle bundle = orchestrator.retrieve(1L, "Spring Boot", budget);

        assertThat(bundle.knowledgeChunks()).isEmpty();
        verify(metrics).recordSkipped("retrieval_error");
    }
}
