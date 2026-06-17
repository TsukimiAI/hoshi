package com.tsukimiai.hoshi.companion.metrics;

public interface CompanionWebSocketMetrics {

    void recordActiveConnections(int activeConnections);

    void recordConnectionOpened(String endpoint);

    void recordConnectionClosed(String endpoint, String closeCodeBucket);

    void recordTransportError(String endpoint);

    void recordEventPublished(String eventType, String source);

    void recordMessageSent(String eventType);

    void recordMessageSendError(String reason);
}
