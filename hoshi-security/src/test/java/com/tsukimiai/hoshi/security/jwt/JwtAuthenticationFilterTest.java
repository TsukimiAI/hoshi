package com.tsukimiai.hoshi.security.jwt;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;

import com.tsukimiai.hoshi.security.jwt.support.InMemoryJwtBlacklistService;

class JwtAuthenticationFilterTest {

    private JwtTokenProvider jwtTokenProvider;
    private InMemoryJwtBlacklistService jwtBlacklistService;
    private JwtAuthenticationFilter filter;

    @BeforeEach
    void setUp() {
        JwtProperties properties = new JwtProperties();
        properties.setSecret("test-secret-key-for-unit-tests-at-least-256-bits-long");
        properties.setAccessTokenTtlSeconds(3600);
        jwtTokenProvider = new JwtTokenProvider(properties);
        jwtBlacklistService = new InMemoryJwtBlacklistService();
        filter = new JwtAuthenticationFilter(jwtTokenProvider, jwtBlacklistService);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void authenticatesValidBearerToken() throws Exception {
        String token = jwtTokenProvider.createAccessToken(7L, "star");

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader(HttpHeaders.AUTHORIZATION, "Bearer " + token);
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, (req, res) -> {});

        assertNotNull(SecurityContextHolder.getContext().getAuthentication());
        assertEquals("star", SecurityContextHolder.getContext().getAuthentication().getName());
    }

    @Test
    void rejectsBlacklistedBearerToken() throws Exception {
        String token = jwtTokenProvider.createAccessToken(7L, "star");
        String jti = jwtTokenProvider.parseToken(token).getId();
        jwtBlacklistService.blacklist(jti, 3600);

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader(HttpHeaders.AUTHORIZATION, "Bearer " + token);
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, (req, res) -> {});

        assertNull(SecurityContextHolder.getContext().getAuthentication());
    }

}
