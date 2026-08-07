package com.tsukimiai.hoshi.skill.knowledge.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.tsukimiai.hoshi.skill.api.knowledge.KnowledgeChunkPayload;
import com.tsukimiai.hoshi.skill.api.knowledge.KnowledgeRetrieveRequest;
import com.tsukimiai.hoshi.skill.knowledge.service.HybridKnowledgeRanker.RankResult;

@ExtendWith(MockitoExtension.class)
class KnowledgeRetrieveServiceTest {

    @Mock
    private KnowledgeQueryPlanner queryPlanner;

    @Mock
    private HybridKnowledgeRanker ranker;

    @Test
    void retrieveReturnsEmptyWhenRequestInvalid() {
        KnowledgeRetrieveService service = new KnowledgeRetrieveService(queryPlanner, ranker);

        assertThat(service.retrieve(new KnowledgeRetrieveRequest(null, "q", 4, 100, 0.5)).chunks()).isEmpty();
        assertThat(service.retrieve(new KnowledgeRetrieveRequest(1L, "   ", 4, 100, 0.5)).chunks()).isEmpty();
    }

    @Test
    void retrieveDelegatesToPlannerAndRanker() {
        KnowledgeRetrieveService service = new KnowledgeRetrieveService(queryPlanner, ranker);
        RetrievalPlan plan = new RetrievalPlan("QA", null, List.of("query"));
        when(queryPlanner.plan(1L, "query")).thenReturn(plan);
        when(ranker.rank(eq(1L), eq(plan), eq("query"), eq(2), eq(0.0), eq(1000)))
                .thenReturn(new RankResult(List.of(
                        new KnowledgeChunkPayload("a.md", "chunk text", "knowledge:10:2", 0.8, null, null)),
                        1));

        var response = service.retrieve(new KnowledgeRetrieveRequest(1L, "query", 2, 1000, 0.0));

        assertThat(response.chunks()).hasSize(1);
        assertThat(response.chunks().get(0).title()).isEqualTo("a.md");
        assertThat(response.chunks().get(0).source()).isEqualTo("knowledge:10:2");
    }
}
