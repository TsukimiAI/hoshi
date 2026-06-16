package com.tsukimiai.hoshi.conversation.dto;

import java.time.LocalDateTime;

import com.tsukimiai.hoshi.conversation.entity.UserMemory;

public record MemoryCorrectionResponse(
        String id,
        String action,
        String memoryType,
        String content,
        String category,
        String supersedesMemoryId,
        String supersededContent,
        LocalDateTime occurredAt) {

    public static MemoryCorrectionResponse supersede(UserMemory memory, UserMemory superseded) {
        return new MemoryCorrectionResponse(
                String.valueOf(memory.getId()),
                "supersede",
                memory.getMemoryType(),
                memory.getContent(),
                memory.getCategory(),
                memory.getSupersedesMemoryId() == null ? null : String.valueOf(memory.getSupersedesMemoryId()),
                superseded == null ? null : superseded.getContent(),
                memory.getCreatedAt());
    }

    public static MemoryCorrectionResponse archive(UserMemory memory) {
        return new MemoryCorrectionResponse(
                String.valueOf(memory.getId()),
                "archive",
                memory.getMemoryType(),
                memory.getContent(),
                memory.getCategory(),
                null,
                null,
                memory.getUpdatedAt());
    }
}
