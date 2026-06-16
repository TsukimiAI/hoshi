package com.tsukimiai.hoshi.conversation.dto;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;

import org.junit.jupiter.api.Test;

import com.tsukimiai.hoshi.conversation.entity.UserMemory;

class MemoryCorrectionResponseTest {

    @Test
    void supersedeIncludesSupersededContent() {
        UserMemory memory = memory(11L);
        UserMemory superseded = memory(10L);
        superseded.setContent("旧内容");

        MemoryCorrectionResponse response = MemoryCorrectionResponse.supersede(memory, superseded);

        assertThat(response.action()).isEqualTo("supersede");
        assertThat(response.supersededContent()).isEqualTo("旧内容");
    }

    @Test
    void archiveUsesUpdatedAt() {
        UserMemory memory = memory(12L);
        memory.setUpdatedAt(LocalDateTime.of(2026, 6, 16, 12, 0));

        MemoryCorrectionResponse response = MemoryCorrectionResponse.archive(memory);

        assertThat(response.action()).isEqualTo("archive");
        assertThat(response.occurredAt()).isEqualTo(LocalDateTime.of(2026, 6, 16, 12, 0));
    }

    private static UserMemory memory(Long id) {
        UserMemory memory = new UserMemory();
        memory.setId(id);
        memory.setMemoryType("short");
        memory.setCategory("plan");
        memory.setContent("新内容");
        memory.setCreatedAt(LocalDateTime.of(2026, 6, 16, 10, 0));
        return memory;
    }
}
