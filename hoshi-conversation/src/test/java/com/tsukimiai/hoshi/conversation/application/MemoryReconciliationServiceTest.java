package com.tsukimiai.hoshi.conversation.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.tsukimiai.hoshi.ai.cognition.AiMemoryCandidate;
import com.tsukimiai.hoshi.ai.cognition.AiMemoryEvidence;
import com.tsukimiai.hoshi.ai.cognition.MemoryReconciliationOperation;
import com.tsukimiai.hoshi.conversation.entity.UserMemory;
import com.tsukimiai.hoshi.conversation.mapper.UserMemoryMapper;

@ExtendWith(MockitoExtension.class)
class MemoryReconciliationServiceTest {

    @Mock
    private UserMemoryMapper userMemoryMapper;

    private MemoryReconciliationService service;

    @BeforeEach
    void setUp() {
        service = new MemoryReconciliationService(userMemoryMapper);
    }

    @Test
    void archiveByStaleHintsArchivesMatchingPlan() {
        UserMemory plan = activeShortMemory(11L, "plan", "明天晚上去外滩玩");
        when(userMemoryMapper.selectList(any())).thenReturn(List.of(plan));

        service.archiveByStaleHints(1L, List.of("明天晚上去外滩玩"));

        ArgumentCaptor<UserMemory> captor = ArgumentCaptor.forClass(UserMemory.class);
        verify(userMemoryMapper).updateById(captor.capture());
        assertThat(captor.getValue().getStatus()).isEqualTo("archived");
    }

    @Test
    void resolveTargetMemoryUsesSupersedesMemoryIdFirst() {
        UserMemory plan = activeShortMemory(11L, "plan", "明天晚上去外滩玩");
        UserMemory other = activeShortMemory(12L, "plan", "完全不同的计划");
        AiMemoryCandidate candidate = new AiMemoryCandidate(
                "老师今晚不去外滩了",
                "short",
                "recent_event",
                "recent",
                "supersede",
                "别的文本",
                11L,
                0.9,
                0.8,
                "用户取消行程",
                new AiMemoryEvidence("user", "今晚去不了了"));

        UserMemory target = service.resolveTargetMemory(1L, List.of(plan, other), candidate);

        assertThat(target).isSameAs(plan);
    }

    @Test
    void resolveTargetMemoryFallsBackToSupersedesContent() {
        UserMemory plan = activeShortMemory(11L, "plan", "明天晚上去外滩玩");
        AiMemoryCandidate candidate = new AiMemoryCandidate(
                "老师今晚不去外滩了",
                "short",
                "recent_event",
                "recent",
                "supersede",
                "明天晚上去外滩玩",
                null,
                0.9,
                0.8,
                "用户取消行程",
                new AiMemoryEvidence("user", "今晚去不了了"));

        UserMemory target = service.resolveTargetMemory(List.of(plan), candidate);

        assertThat(target).isSameAs(plan);
    }

    @Test
    void applyReconciliationOperationsSupersedesWithTargetMemoryId() {
        UserMemory plan = activeShortMemory(11L, "plan", "明天晚上去外滩玩");
        when(userMemoryMapper.selectList(any())).thenReturn(List.of(plan));

        int applied = service.applyReconciliationOperations(
                1L,
                2L,
                null,
                List.of(new MemoryReconciliationOperation(
                        "supersede",
                        11L,
                        "明天晚上去外滩玩",
                        "老师今晚不去外滩了",
                        "short",
                        "recent_event",
                        "计划已取消",
                        0.9)),
                0.8);

        ArgumentCaptor<UserMemory> insertCaptor = ArgumentCaptor.forClass(UserMemory.class);
        verify(userMemoryMapper).updateById(any(UserMemory.class));
        verify(userMemoryMapper).insert(insertCaptor.capture());
        assertThat(applied).isEqualTo(1);
        assertThat(insertCaptor.getValue().getSupersedesMemoryId()).isEqualTo(11L);
    }

    @Test
    void applyReconciliationOperationsSkipsRecentlyArchivedHint() {
        UserMemory plan = activeShortMemory(11L, "plan", "明天晚上去外滩玩");
        when(userMemoryMapper.selectList(any())).thenReturn(List.of(plan));

        int applied = service.applyReconciliationOperations(
                1L,
                2L,
                null,
                List.of(new MemoryReconciliationOperation(
                        "archive",
                        null,
                        "明天晚上去外滩玩",
                        null,
                        "short",
                        "plan",
                        "重复归档",
                        0.9)),
                0.8,
                List.of("明天晚上去外滩玩"));

        assertThat(applied).isZero();
        verify(userMemoryMapper, never()).updateById(any(UserMemory.class));
    }

    @Test
    void applyReconciliationOperationsSkipsLowConfidence() {
        UserMemory plan = activeShortMemory(11L, "plan", "明天晚上去外滩玩");
        when(userMemoryMapper.selectList(any())).thenReturn(List.of(plan));

        int applied = service.applyReconciliationOperations(
                1L,
                2L,
                null,
                List.of(new MemoryReconciliationOperation(
                        "archive",
                        null,
                        "明天晚上去外滩玩",
                        null,
                        "short",
                        "plan",
                        "低置信",
                        0.2)),
                0.8);

        assertThat(applied).isZero();
        verify(userMemoryMapper, never()).updateById(any(UserMemory.class));
    }

    @Test
    void formatActiveMemoryLineIncludesId() {
        UserMemory memory = activeShortMemory(11L, "plan", "明天晚上去外滩玩");

        assertThat(MemoryReconciliationService.formatActiveMemoryLine(memory))
                .isEqualTo("- [id=11] [plan] 明天晚上去外滩玩");
    }

    private static UserMemory activeShortMemory(Long id, String category, String content) {
        UserMemory memory = new UserMemory();
        memory.setId(id);
        memory.setUserId(1L);
        memory.setMemoryType("short");
        memory.setCategory(category);
        memory.setContent(content);
        memory.setStatus("active");
        memory.setLastReinforcedAt(LocalDateTime.now().minusHours(2));
        memory.setStrengthScore(0.8);
        memory.setHalfLifeHours(72);
        return memory;
    }
}
