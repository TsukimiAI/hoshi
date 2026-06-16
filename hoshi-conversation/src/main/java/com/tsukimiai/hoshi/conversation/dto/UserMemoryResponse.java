package com.tsukimiai.hoshi.conversation.dto;

import java.time.LocalDateTime;

import com.tsukimiai.hoshi.conversation.entity.UserMemory;

public record UserMemoryResponse(
        String id,
        String memoryType,
        String content,
        String category,
        boolean alwaysPinned,
        String supersedesMemoryId,
        LocalDateTime createdAt,
        LocalDateTime updatedAt) {

    public static UserMemoryResponse from(UserMemory memory) {
        return new UserMemoryResponse(
                String.valueOf(memory.getId()),
                memory.getMemoryType(),
                memory.getContent(),
                memory.getCategory(),
                memory.getAlwaysPinned() != null && memory.getAlwaysPinned() == 1,
                memory.getSupersedesMemoryId() == null ? null : String.valueOf(memory.getSupersedesMemoryId()),
                memory.getCreatedAt(),
                memory.getUpdatedAt());
    }
}
