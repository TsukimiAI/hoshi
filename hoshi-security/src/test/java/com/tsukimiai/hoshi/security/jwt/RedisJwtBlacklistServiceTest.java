package com.tsukimiai.hoshi.security.jwt;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Duration;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

@ExtendWith(MockitoExtension.class)
class RedisJwtBlacklistServiceTest {

    @Mock
    private StringRedisTemplate redisTemplate;

    @Mock
    private ValueOperations<String, String> valueOperations;

    @Test
    void blacklistStoresKeyWithTtl() {
        RedisJwtBlacklistService redisJwtBlacklistService = new RedisJwtBlacklistService(redisTemplate, null);
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        redisJwtBlacklistService.blacklist("jti-1", 120);

        verify(valueOperations).set("hoshi:jwt:blacklist:jti-1", "1", Duration.ofSeconds(120));
    }

    @Test
    void blacklistIgnoresInvalidInput() {
        RedisJwtBlacklistService redisJwtBlacklistService = new RedisJwtBlacklistService(redisTemplate, null);
        redisJwtBlacklistService.blacklist("", 120);
        redisJwtBlacklistService.blacklist("jti-1", 0);

        verifyNoInteractions(valueOperations);
    }

    @Test
    void isBlacklistedChecksRedisKey() {
        RedisJwtBlacklistService redisJwtBlacklistService = new RedisJwtBlacklistService(redisTemplate, null);
        when(redisTemplate.hasKey("hoshi:jwt:blacklist:jti-2")).thenReturn(true);

        assertTrue(redisJwtBlacklistService.isBlacklisted("jti-2"));
    }

    @Test
    void isBlacklistedReturnsFalseForMissingJti() {
        RedisJwtBlacklistService redisJwtBlacklistService = new RedisJwtBlacklistService(redisTemplate, null);
        assertFalse(redisJwtBlacklistService.isBlacklisted(null));
        assertFalse(redisJwtBlacklistService.isBlacklisted(" "));
        verifyNoInteractions(redisTemplate);
    }

}
