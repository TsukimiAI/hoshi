package com.tsukimiai.hoshi.conversation.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "hoshi.skill.knowledge")
public class KnowledgeSkillProperties {

    private boolean enabled = false;

    private String baseUrl = "";

    private int timeoutMs = 5000;

    private String authToken = "";

    private int uploadTimeoutMs = 120000;

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getBaseUrl() {
        return baseUrl;
    }

    public void setBaseUrl(String baseUrl) {
        this.baseUrl = baseUrl;
    }

    public String getResolvedBaseUrl() {
        if (baseUrl == null || baseUrl.isBlank()) {
            return "http://localhost:8090";
        }
        String normalized = baseUrl.strip();
        while (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return normalized;
    }

    public int getTimeoutMs() {
        return timeoutMs;
    }

    public void setTimeoutMs(int timeoutMs) {
        this.timeoutMs = timeoutMs;
    }

    public int getUploadTimeoutMs() {
        return uploadTimeoutMs;
    }

    public void setUploadTimeoutMs(int uploadTimeoutMs) {
        this.uploadTimeoutMs = uploadTimeoutMs;
    }

    public String getAuthToken() {
        return authToken;
    }

    public void setAuthToken(String authToken) {
        this.authToken = authToken;
    }

    public boolean isConfigured() {
        return enabled && baseUrl != null && !baseUrl.isBlank();
    }
}
