package com.tsukimiai.hoshi.security.jwt;

import java.time.Duration;

import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.data.redis.core.StringRedisTemplate;

public class RedisJwtBlacklistService implements JwtBlacklistService {

    private static final String KEY_PREFIX = "hoshi:jwt:blacklist:";

    private final StringRedisTemplate redisTemplate;
    private final MeterRegistry meterRegistry;

    public RedisJwtBlacklistService(StringRedisTemplate redisTemplate, MeterRegistry meterRegistry) {
        this.redisTemplate = redisTemplate;
        this.meterRegistry = meterRegistry;
    }

    @Override
    public void blacklist(String jti, long ttlSeconds) {
        if (jti == null || jti.isBlank() || ttlSeconds <= 0) {
            return;
        }
        redisTemplate.opsForValue().set(KEY_PREFIX + jti, "1", Duration.ofSeconds(ttlSeconds));
    }

    @Override
    public boolean isBlacklisted(String jti) {
        if (jti == null || jti.isBlank()) {
            return false;
        }
        recordBlacklistCheck();
        boolean hit = Boolean.TRUE.equals(redisTemplate.hasKey(KEY_PREFIX + jti));
        if (hit) {
            recordBlacklistHit();
        }
        return hit;
    }

    private void recordBlacklistCheck() {
        if (meterRegistry == null) {
            return;
        }
        meterRegistry.counter("hoshi.security.jwt.blacklist.checks.total").increment();
    }

    private void recordBlacklistHit() {
        if (meterRegistry == null) {
            return;
        }
        meterRegistry.counter("hoshi.security.jwt.blacklist.hits.total").increment();
    }
}
