package com.tsukimiai.hoshi.conversation.application.proactive;

/**
 * Hook for future Prometheus / metrics integration.
 */
public interface ProactiveConversationMetrics {

    void recordScan(int candidateUsers);

    void recordScanDuration(String outcome, long durationNanos);

    void recordTriggered(String sourceType);

    void recordSkipped(String reason);

    void recordUserError(String errorType);
}
