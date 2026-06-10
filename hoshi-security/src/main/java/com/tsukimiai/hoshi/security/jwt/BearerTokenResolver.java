package com.tsukimiai.hoshi.security.jwt;

import org.springframework.http.HttpHeaders;

import jakarta.servlet.http.HttpServletRequest;

public final class BearerTokenResolver {

    private BearerTokenResolver() {
    }

    public static String resolve(HttpServletRequest request) {
        String authorization = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            return null;
        }
        String token = authorization.substring(7).trim();
        return token.isEmpty() ? null : token;
    }

}
