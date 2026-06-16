package com.tsukimiai.hoshi.conversation.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "hoshi.proactive")
public class ProactiveConversationProperties {

    private boolean enabled = true;
    private long scanIntervalMs = 45L * 60L * 1000L;
    private int minIdleMinutes = 30;
    private int sessionCooldownMinutes = 180;
    private int dailyLimit = 3;
    private int sourceCooldownHours = 24;
    private double baseProbability = 0.35;
    private int quietHoursStart = 23;
    private int quietHoursEnd = 8;
    private int maxUsersPerScan = 20;
    private int timingJudgmentTopN = 2;
    private FollowUp followUp = new FollowUp();

    public static class FollowUp {
        private boolean enabled = true;
        private int maxRoundsPerSse = 8;
        private double judgmentMinConfidence = 0.5;
        private double firstRoundJudgmentMinConfidence = 0.4;

        public boolean isEnabled() {
            return enabled;
        }

        public void setEnabled(boolean enabled) {
            this.enabled = enabled;
        }

        public int getMaxRoundsPerSse() {
            return maxRoundsPerSse;
        }

        public void setMaxRoundsPerSse(int maxRoundsPerSse) {
            this.maxRoundsPerSse = maxRoundsPerSse;
        }

        public double getJudgmentMinConfidence() {
            return judgmentMinConfidence;
        }

        public void setJudgmentMinConfidence(double judgmentMinConfidence) {
            this.judgmentMinConfidence = judgmentMinConfidence;
        }

        public double getFirstRoundJudgmentMinConfidence() {
            return firstRoundJudgmentMinConfidence;
        }

        public void setFirstRoundJudgmentMinConfidence(double firstRoundJudgmentMinConfidence) {
            this.firstRoundJudgmentMinConfidence = firstRoundJudgmentMinConfidence;
        }
    }

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

    public int getMinIdleMinutes() {
        return minIdleMinutes;
    }

    public void setMinIdleMinutes(int minIdleMinutes) {
        this.minIdleMinutes = minIdleMinutes;
    }

    public int getSessionCooldownMinutes() {
        return sessionCooldownMinutes;
    }

    public void setSessionCooldownMinutes(int sessionCooldownMinutes) {
        this.sessionCooldownMinutes = sessionCooldownMinutes;
    }

    public int getDailyLimit() {
        return dailyLimit;
    }

    public void setDailyLimit(int dailyLimit) {
        this.dailyLimit = dailyLimit;
    }

    public int getSourceCooldownHours() {
        return sourceCooldownHours;
    }

    public void setSourceCooldownHours(int sourceCooldownHours) {
        this.sourceCooldownHours = sourceCooldownHours;
    }

    public double getBaseProbability() {
        return baseProbability;
    }

    public void setBaseProbability(double baseProbability) {
        this.baseProbability = baseProbability;
    }

    public int getQuietHoursStart() {
        return quietHoursStart;
    }

    public void setQuietHoursStart(int quietHoursStart) {
        this.quietHoursStart = quietHoursStart;
    }

    public int getQuietHoursEnd() {
        return quietHoursEnd;
    }

    public void setQuietHoursEnd(int quietHoursEnd) {
        this.quietHoursEnd = quietHoursEnd;
    }

    public int getMaxUsersPerScan() {
        return maxUsersPerScan;
    }

    public void setMaxUsersPerScan(int maxUsersPerScan) {
        this.maxUsersPerScan = maxUsersPerScan;
    }

    public int getTimingJudgmentTopN() {
        return timingJudgmentTopN;
    }

    public void setTimingJudgmentTopN(int timingJudgmentTopN) {
        this.timingJudgmentTopN = timingJudgmentTopN;
    }

    public FollowUp getFollowUp() {
        return followUp;
    }

    public void setFollowUp(FollowUp followUp) {
        this.followUp = followUp == null ? new FollowUp() : followUp;
    }
}
