package com.tsukimiai.hoshi.conversation.application;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class LoggingMemoryReconciliationMetrics implements MemoryReconciliationMetrics {

    private static final Logger log = LoggerFactory.getLogger(LoggingMemoryReconciliationMetrics.class);

    @Override
    public void recordScan(int candidateUsers) {
        log.debug("Memory reconciliation scan candidates: {}", candidateUsers);
    }

    @Override
    public void recordScanDuration(String outcome, long durationNanos) {
        log.debug("Memory reconciliation scan duration: outcome={}, durationNanos={}", outcome, durationNanos);
    }

    @Override
    public void recordSkipped(String reason) {
        log.debug("Memory reconciliation skipped: reason={}", reason);
    }

    @Override
    public void recordCompleted() {
        log.debug("Memory reconciliation completed");
    }

    @Override
    public void recordOperationsApplied(int operationsApplied) {
        log.debug("Memory reconciliation operations applied: {}", operationsApplied);
    }

    @Override
    public void recordUserError(String errorType) {
        log.debug("Memory reconciliation user error: errorType={}", errorType);
    }
}
