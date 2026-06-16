package com.tsukimiai.hoshi.server.memory;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.tsukimiai.hoshi.conversation.application.MemoryReconciliationWorkflow;

@Component
public class MemoryReconciliationScheduler {

    private final MemoryReconciliationWorkflow memoryReconciliationWorkflow;

    public MemoryReconciliationScheduler(MemoryReconciliationWorkflow memoryReconciliationWorkflow) {
        this.memoryReconciliationWorkflow = memoryReconciliationWorkflow;
    }

    @Scheduled(fixedDelayString = "${hoshi.memory.reconciliation.scan-interval-ms:86400000}")
    public void scan() {
        memoryReconciliationWorkflow.scanAllUsers();
    }
}
