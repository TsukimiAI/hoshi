package com.tsukimiai.hoshi.conversation.dto;

import java.time.LocalDateTime;

import com.tsukimiai.hoshi.conversation.entity.UserMemory;

public record RecentMemoryResponse(
        String id,
        String memoryType,
        String content,
        String category,
        boolean alwaysPinned,
        String sourceSessionId,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        String eventType) {

    public static RecentMemoryResponse from(UserMemory memory, String eventType) {
        return new RecentMemoryResponse(
                String.valueOf(memory.getId()),
                memory.getMemoryType(),
                memory.getContent(),
                memory.getCategory(),
                memory.getAlwaysPinned() != null && memory.getAlwaysPinned() == 1,
                memory.getSourceSessionId() == null ? null : String.valueOf(memory.getSourceSessionId()),
                memory.getCreatedAt(),
                memory.getUpdatedAt(),
                eventType);
    }
}
