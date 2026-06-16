package com.tsukimiai.hoshi.conversation.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "hoshi.memory.reconciliation")
public class MemoryReconciliationProperties {

    private boolean enabled = true;
    private long scanIntervalMs = 86_400_000L;
    private int maxUsersPerScan = 50;
    private int maxSessionsPerScan = 2;
    private int archivedLookbackDays = 7;

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public long getScanIntervalMs() {
        return scanIntervalMs;
    }

    public void setScanIntervalMs(long scanIntervalMs) {
        this.scanIntervalMs = scanIntervalMs;
    }

    public int getMaxUsersPerScan() {
        return maxUsersPerScan;
    }

    public void setMaxUsersPerScan(int maxUsersPerScan) {
        this.maxUsersPerScan = maxUsersPerScan;
    }

    public int getMaxSessionsPerScan() {
        return maxSessionsPerScan;
    }

    public void setMaxSessionsPerScan(int maxSessionsPerScan) {
        this.maxSessionsPerScan = maxSessionsPerScan;
    }

    public int getArchivedLookbackDays() {
        return archivedLookbackDays;
    }

    public void setArchivedLookbackDays(int archivedLookbackDays) {
        this.archivedLookbackDays = archivedLookbackDays;
    }
}
