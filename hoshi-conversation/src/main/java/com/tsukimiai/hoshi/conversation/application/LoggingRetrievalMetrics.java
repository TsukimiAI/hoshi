package com.tsukimiai.hoshi.conversation.application;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class LoggingRetrievalMetrics implements RetrievalMetrics {

    private static final Logger log = LoggerFactory.getLogger(LoggingRetrievalMetrics.class);

    @Override
    public void recordSkipped(String reason) {
        log.debug("Retrieval skipped: reason={}", reason);
    }

    @Override
    public void recordKnowledgeHits(int hitCount) {
        log.debug("Knowledge retrieval hits: {}", hitCount);
    }

    @Override
    public void recordRetrievalDuration(long durationNanos) {
        log.debug("Retrieval duration: durationNanos={}", durationNanos);
    }
}
