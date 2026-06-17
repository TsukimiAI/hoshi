package com.tsukimiai.hoshi.user.service.impl;

import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;

import com.tsukimiai.hoshi.common.exception.BusinessException;
import com.tsukimiai.hoshi.common.exception.ErrorCode;
import com.tsukimiai.hoshi.user.config.HoshiAuthProperties;
import com.tsukimiai.hoshi.user.service.AuthRateLimitService;

import io.micrometer.core.instrument.MeterRegistry;

@Service
public class AuthRateLimitServiceImpl implements AuthRateLimitService {

    private final HoshiAuthProperties authProperties;
    private final ConcurrentMap<String, WindowCounter> counters = new ConcurrentHashMap<>();
    private final MeterRegistry meterRegistry;

    public AuthRateLimitServiceImpl(HoshiAuthProperties authProperties, ObjectProvider<MeterRegistry> meterRegistryProvider) {
        this.authProperties = authProperties;
        this.meterRegistry = meterRegistryProvider.getIfAvailable();
    }

    @Override
    public void checkLoginAllowed(String clientKey) {
        checkAllowed("login:" + clientKey, authProperties.getLoginMaxAttemptsPerMinute(), 60);
    }

    @Override
    public void checkSendCodeAllowed(String email) {
        checkAllowed("send-code:" + email.trim().toLowerCase(), authProperties.getSendCodeMaxAttemptsPerHour(), 3600);
    }

    private void checkAllowed(String key, int maxAttempts, int windowSeconds) {
        long now = Instant.now().getEpochSecond();
        WindowCounter counter = counters.computeIfAbsent(key, ignored -> new WindowCounter(now, 0));
        synchronized (counter) {
            if (now - counter.windowStartEpochSecond >= windowSeconds) {
                counter.windowStartEpochSecond = now;
                counter.count = 0;
            }
            counter.count++;
            if (counter.count > maxAttempts) {
                recordRateLimitBlocked(key);
                if (key.startsWith("login:")) {
                    throw new BusinessException(ErrorCode.TOO_MANY_LOGIN_ATTEMPTS);
                }
                throw new BusinessException(ErrorCode.EMAIL_CODE_SEND_TOO_FREQUENT);
            }
        }
    }

    private void recordRateLimitBlocked(String key) {
        if (meterRegistry == null) {
            return;
        }
        String blockType = key != null && key.startsWith("login:") ? "login" : "send_code";
        meterRegistry.counter(
                "hoshi.auth.rate_limit.blocked.total",
                "block_type", blockType)
                .increment();
    }

    private static final class WindowCounter {
        private long windowStartEpochSecond;
        private int count;

        private WindowCounter(long windowStartEpochSecond, int count) {
            this.windowStartEpochSecond = windowStartEpochSecond;
            this.count = count;
        }
    }

}
