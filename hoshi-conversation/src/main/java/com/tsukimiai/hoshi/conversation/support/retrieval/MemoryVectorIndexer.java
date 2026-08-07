package com.tsukimiai.hoshi.conversation.support.retrieval;

import com.tsukimiai.hoshi.conversation.entity.UserMemory;

public interface MemoryVectorIndexer {

    void upsertLongMemory(UserMemory memory);

    void deleteMemory(Long userId, Long memoryId);
}

