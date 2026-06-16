package com.tsukimiai.hoshi.conversation.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.tsukimiai.hoshi.ai.cognition.AiMemoryCandidate;
import com.tsukimiai.hoshi.conversation.entity.UserMemory;
import com.tsukimiai.hoshi.conversation.mapper.UserMemoryMapper;
import com.tsukimiai.hoshi.conversation.support.MemoryContentMatcher;

@ExtendWith(MockitoExtension.class)
class MemoryReconciliationEvalTest {

    @Mock
    private UserMemoryMapper userMemoryMapper;

    private MemoryReconciliationService service;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        service = new MemoryReconciliationService(userMemoryMapper);
        objectMapper = new ObjectMapper();
    }

    @Test
    void evalBundCancelScenarios() throws Exception {
        JsonNode scenarios = objectMapper.readTree(
                getClass().getResourceAsStream("/memory-eval/bund-cancel-scenarios.json"));
        assertThat(scenarios.isArray()).isTrue();

        for (JsonNode scenario : scenarios) {
            String name = scenario.get("name").asText();
            if ("bund-plan-supersede".equals(name)) {
                runSupersedeScenario(scenario);
            } else if ("bund-plan-archive-by-hint".equals(name)) {
                runArchiveScenario(scenario);
            }
        }
    }

    private void runSupersedeScenario(JsonNode scenario) {
        List<UserMemory> existing = loadMemories(scenario.get("existingMemories"), 1L);
        JsonNode candidateNode = scenario.get("candidate");
        AiMemoryCandidate candidate = new AiMemoryCandidate(
                candidateNode.get("content").asText(),
                candidateNode.get("memoryType").asText(),
                candidateNode.get("category").asText(),
                null,
                candidateNode.get("action").asText(),
                candidateNode.get("supersedesContent").asText(),
                candidateNode.get("supersedesMemoryId").asLong(),
                candidateNode.get("confidence").asDouble(),
                candidateNode.get("importance").asDouble(),
                null,
                null);

        UserMemory target = service.resolveTargetMemory(1L, existing, candidate);
        assertThat(target).isNotNull();
        assertThat(target.getId()).isEqualTo(scenario.get("expectedTargetId").asLong());
    }

    private void runArchiveScenario(JsonNode scenario) {
        List<UserMemory> existing = loadMemories(scenario.get("existingMemories"), 1L);
        String hint = scenario.get("staleHint").asText();
        UserMemory matched = MemoryContentMatcher.findBestMatchByHint(
                existing,
                hint,
                MemoryContentMatcher.STALE_HINT_SIMILARITY_THRESHOLD);
        assertThat(matched).isNotNull();
        assertThat(matched.getId()).isEqualTo(scenario.get("expectedArchivedId").asLong());

        service.archiveByStaleHints(1L, List.of(hint));
        verify(userMemoryMapper).updateById(any(UserMemory.class));
    }

    private List<UserMemory> loadMemories(JsonNode nodes, Long userId) {
        List<UserMemory> memories = new ArrayList<>();
        for (JsonNode node : nodes) {
            UserMemory memory = new UserMemory();
            memory.setId(node.get("id").asLong());
            memory.setUserId(userId);
            memory.setMemoryType(node.get("memoryType").asText());
            memory.setCategory(node.get("category").asText());
            memory.setContent(node.get("content").asText());
            memory.setStatus(node.get("status").asText());
            memory.setUpdatedAt(LocalDateTime.now());
            memories.add(memory);
        }
        when(userMemoryMapper.selectList(any())).thenReturn(memories);
        return memories;
    }
}
