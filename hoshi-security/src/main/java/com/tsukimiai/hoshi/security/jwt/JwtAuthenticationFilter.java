package com.tsukimiai.hoshi.security.jwt;

import java.io.IOException;
import java.util.Collections;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import io.jsonwebtoken.Claims;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtTokenProvider jwtTokenProvider;
    private final JwtBlacklistService jwtBlacklistService;
    private final MeterRegistry meterRegistry;

    public JwtAuthenticationFilter(
            JwtTokenProvider jwtTokenProvider,
            JwtBlacklistService jwtBlacklistService,
            ObjectProvider<MeterRegistry> meterRegistryProvider) {
        this.jwtTokenProvider = jwtTokenProvider;
        this.jwtBlacklistService = jwtBlacklistService;
        this.meterRegistry = meterRegistryProvider.getIfAvailable();
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String authorization = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (authorization != null && authorization.startsWith("Bearer ")) {
            String token = authorization.substring(7);
            try {
                Claims claims = jwtTokenProvider.parseToken(token);
                recordJwtParsed("success");
                String jti = claims.getId();
                if (jwtBlacklistService.isBlacklisted(jti)) {
                    recordBlacklistHit();
                    throw new IllegalArgumentException("Token revoked");
                }
                String username = claims.get("username", String.class);
                if (username == null || username.isBlank()) {
                    recordMissingUsernameClaim();
                    throw new IllegalArgumentException("Missing username claim");
                }
                UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                        username,
                        null,
                        Collections.emptyList());
                authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                SecurityContextHolder.getContext().setAuthentication(authentication);
            } catch (RuntimeException ignored) {
                recordJwtParsed("failure");
                SecurityContextHolder.clearContext();
            }
        }
        filterChain.doFilter(request, response);
    }

    private void recordJwtParsed(String outcome) {
        if (meterRegistry == null) {
            return;
        }
        meterRegistry.counter("hoshi.security.jwt.parsed.total", "outcome", outcome).increment();
    }

    private void recordBlacklistHit() {
        if (meterRegistry == null) {
            return;
        }
        meterRegistry.counter("hoshi.security.jwt.blacklist.hit.total").increment();
    }

    private void recordMissingUsernameClaim() {
        if (meterRegistry == null) {
            return;
        }
        meterRegistry.counter("hoshi.security.jwt.missing_username_claim.total").increment();
    }
}
