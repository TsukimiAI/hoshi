package com.tsukimiai.hoshi.conversation.support.retrieval;

import com.tsukimiai.hoshi.conversation.entity.UserMemory;

public class NoopMemoryVectorIndexer implements MemoryVectorIndexer {

    @Override
    public void upsertLongMemory(UserMemory memory) {
        // no-op
    }

    @Override
    public void deleteMemory(Long userId, Long memoryId) {
        // no-op
    }
}

