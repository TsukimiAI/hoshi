package com.tsukimiai.hoshi.security.jwt;

import java.time.Duration;

import org.springframework.data.redis.core.StringRedisTemplate;

public class RedisJwtBlacklistService implements JwtBlacklistService {

    private static final String KEY_PREFIX = "hoshi:jwt:blacklist:";

    private final StringRedisTemplate redisTemplate;

    public RedisJwtBlacklistService(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
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
        return Boolean.TRUE.equals(redisTemplate.hasKey(KEY_PREFIX + jti));
    }

}
