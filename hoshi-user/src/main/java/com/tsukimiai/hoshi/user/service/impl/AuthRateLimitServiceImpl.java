package com.tsukimiai.hoshi.user.service.impl;

import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

import org.springframework.stereotype.Service;

import com.tsukimiai.hoshi.common.exception.BusinessException;
import com.tsukimiai.hoshi.common.exception.ErrorCode;
import com.tsukimiai.hoshi.user.config.HoshiAuthProperties;
import com.tsukimiai.hoshi.user.service.AuthRateLimitService;

@Service
public class AuthRateLimitServiceImpl implements AuthRateLimitService {

    private final HoshiAuthProperties authProperties;
    private final ConcurrentMap<String, WindowCounter> counters = new ConcurrentHashMap<>();

    public AuthRateLimitServiceImpl(HoshiAuthProperties authProperties) {
        this.authProperties = authProperties;
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
                if (key.startsWith("login:")) {
                    throw new BusinessException(ErrorCode.TOO_MANY_LOGIN_ATTEMPTS);
                }
                throw new BusinessException(ErrorCode.EMAIL_CODE_SEND_TOO_FREQUENT);
            }
        }
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
