package com.tsukimiai.hoshi.metrics.companion;

import java.util.concurrent.atomic.AtomicInteger;

import org.springframework.util.StringUtils;

import com.tsukimiai.hoshi.companion.metrics.CompanionWebSocketMetrics;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tags;

public class MicrometerCompanionWebSocketMetrics implements CompanionWebSocketMetrics {

    private final MeterRegistry meterRegistry;
    private final AtomicInteger activeConnections = new AtomicInteger();

    public MicrometerCompanionWebSocketMetrics(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
        meterRegistry.gauge("hoshi.companion.ws.connections.active", activeConnections);
    }

    @Override
    public void recordActiveConnections(int activeConnections) {
        this.activeConnections.set(Math.max(activeConnections, 0));
    }

    @Override
    public void recordConnectionOpened(String endpoint) {
        counter("hoshi.companion.ws.connections.opened.total", Tags.of("endpoint", sanitize(endpoint)))
                .increment();
    }

    @Override
    public void recordConnectionClosed(String endpoint, String closeCodeBucket) {
        counter(
                "hoshi.companion.ws.connections.closed.total",
                Tags.of("endpoint", sanitize(endpoint), "close_code_bucket", sanitize(closeCodeBucket)))
                .increment();
    }

    @Override
    public void recordTransportError(String endpoint) {
        counter("hoshi.companion.ws.transport.errors.total", Tags.of("endpoint", sanitize(endpoint)))
                .increment();
    }

    @Override
    public void recordEventPublished(String eventType, String source) {
        counter(
                "hoshi.companion.ws.events.published.total",
                Tags.of("event_type", sanitize(eventType), "source", sanitize(source)))
                .increment();
    }

    @Override
    public void recordMessageSent(String eventType) {
        counter("hoshi.companion.ws.messages.sent.total", Tags.of("event_type", sanitize(eventType)))
                .increment();
    }

    @Override
    public void recordMessageSendError(String reason) {
        counter("hoshi.companion.ws.messages.send.errors.total", Tags.of("reason", sanitize(reason)))
                .increment();
    }

    private Counter counter(String name, Tags tags) {
        return Counter.builder(name).tags(tags).register(meterRegistry);
    }

    private String sanitize(String value) {
        return StringUtils.hasText(value) ? value.trim() : "unknown";
    }
}
