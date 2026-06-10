package com.tsukimiai.hoshi.user.web;

import jakarta.servlet.http.HttpServletRequest;

public final class RequestClientResolver {

    private RequestClientResolver() {
    }

    public static String resolveClientKey(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }

}
