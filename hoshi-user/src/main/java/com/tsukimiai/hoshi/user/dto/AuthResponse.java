package com.tsukimiai.hoshi.user.dto;

public record AuthResponse(
        String accessToken,
        String refreshToken,
        String tokenType,
        long expiresIn,
        long refreshExpiresIn,
        UserProfile user) {

    public record UserProfile(
            Long id,
            String username,
            String email,
            String avatarUrl,
            boolean emailVerified) {

    }

}
