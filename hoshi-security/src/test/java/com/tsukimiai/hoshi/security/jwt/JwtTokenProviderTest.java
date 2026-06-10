package com.tsukimiai.hoshi.security.jwt;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.tsukimiai.hoshi.security.jwt.support.InMemoryJwtBlacklistService;

import io.jsonwebtoken.Claims;

class JwtTokenProviderTest {

    private JwtTokenProvider jwtTokenProvider;
    private InMemoryJwtBlacklistService jwtBlacklistService;

    @BeforeEach
    void setUp() {
        JwtProperties properties = new JwtProperties();
        properties.setSecret("test-secret-key-for-unit-tests-at-least-256-bits-long");
        properties.setAccessTokenTtlSeconds(3600);
        jwtTokenProvider = new JwtTokenProvider(properties);
        jwtBlacklistService = new InMemoryJwtBlacklistService();
    }

    @Test
    void createAccessTokenIncludesJti() {
        String token = jwtTokenProvider.createAccessToken(42L, "hoshi");

        Claims claims = jwtTokenProvider.parseToken(token);
        assertEquals("42", claims.getSubject());
        assertEquals("hoshi", claims.get("username", String.class));
        assertNotNull(claims.getId());
        assertFalse(claims.getId().isBlank());
    }

    @Test
    void blacklistAccessTokenBlocksSubsequentValidation() {
        String token = jwtTokenProvider.createAccessToken(1L, "testuser");
        Claims claims = jwtTokenProvider.parseToken(token);

        jwtTokenProvider.blacklistAccessToken(token, jwtBlacklistService);

        assertTrue(jwtBlacklistService.isBlacklisted(claims.getId()));
    }

    @Test
    void getRemainingTtlSecondsIsPositiveForFreshToken() {
        String token = jwtTokenProvider.createAccessToken(1L, "testuser");
        Claims claims = jwtTokenProvider.parseToken(token);

        assertTrue(jwtTokenProvider.getRemainingTtlSeconds(claims) > 0);
    }

}
