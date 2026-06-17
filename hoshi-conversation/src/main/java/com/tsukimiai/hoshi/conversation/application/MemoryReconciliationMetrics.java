package com.tsukimiai.hoshi.conversation.application;

public interface MemoryReconciliationMetrics {

    void recordScan(int candidateUsers);

    void recordScanDuration(String outcome, long durationNanos);

    void recordSkipped(String reason);

    void recordCompleted();

    void recordOperationsApplied(int operationsApplied);

    void recordUserError(String errorType);
}
