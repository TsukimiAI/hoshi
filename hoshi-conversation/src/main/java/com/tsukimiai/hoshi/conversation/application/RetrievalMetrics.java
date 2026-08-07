package com.tsukimiai.hoshi.conversation.application;

public interface RetrievalMetrics {

    void recordSkipped(String reason);

    void recordKnowledgeHits(int hitCount);

    void recordRetrievalDuration(long durationNanos);
}
