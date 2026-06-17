package com.tsukimiai.hoshi.companion.metrics;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class LoggingCompanionWebSocketMetrics implements CompanionWebSocketMetrics {

    private static final Logger log = LoggerFactory.getLogger(LoggingCompanionWebSocketMetrics.class);

    @Override
    public void recordActiveConnections(int activeConnections) {
        log.debug("Companion websocket active connections: {}", activeConnections);
    }

    @Override
    public void recordConnectionOpened(String endpoint) {
        log.debug("Companion websocket opened: endpoint={}", endpoint);
    }

    @Override
    public void recordConnectionClosed(String endpoint, String closeCodeBucket) {
        log.debug("Companion websocket closed: endpoint={}, closeCodeBucket={}", endpoint, closeCodeBucket);
    }

    @Override
    public void recordTransportError(String endpoint) {
        log.debug("Companion websocket transport error: endpoint={}", endpoint);
    }

    @Override
    public void recordEventPublished(String eventType, String source) {
        log.debug("Companion websocket event published: eventType={}, source={}", eventType, source);
    }

    @Override
    public void recordMessageSent(String eventType) {
        log.debug("Companion websocket message sent: eventType={}", eventType);
    }

    @Override
    public void recordMessageSendError(String reason) {
        log.debug("Companion websocket message send error: reason={}", reason);
    }
}
