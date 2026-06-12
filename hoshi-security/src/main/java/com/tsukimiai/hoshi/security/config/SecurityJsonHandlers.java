package com.tsukimiai.hoshi.security.config;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import org.springframework.http.MediaType;

import com.tsukimiai.hoshi.common.exception.ErrorCode;

import jakarta.servlet.http.HttpServletResponse;

final class SecurityJsonHandlers {

    private SecurityJsonHandlers() {
    }

    static org.springframework.security.web.AuthenticationEntryPoint authenticationEntryPoint() {
        return (request, response, authException) -> writeError(
                response,
                HttpServletResponse.SC_UNAUTHORIZED,
                ErrorCode.UNAUTHORIZED.getCode(),
                ErrorCode.UNAUTHORIZED.getMessage());
    }

    static org.springframework.security.web.access.AccessDeniedHandler accessDeniedHandler() {
        return (request, response, accessDeniedException) -> writeError(
                response,
                HttpServletResponse.SC_FORBIDDEN,
                ErrorCode.FORBIDDEN.getCode(),
                ErrorCode.FORBIDDEN.getMessage());
    }

    private static void writeError(HttpServletResponse response, int status, int code, String message)
            throws IOException {
        if (response.isCommitted()) {
            return;
        }
        response.setStatus(status);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write(toJson(code, message));
    }

    private static String toJson(int code, String message) {
        return "{\"code\":" + code + ",\"message\":\"" + escapeJson(message) + "\",\"data\":null}";
    }

    private static String escapeJson(String value) {
        if (value == null) {
            return "";
        }
        return value
                .replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\r", "\\r")
                .replace("\n", "\\n");
    }
}
