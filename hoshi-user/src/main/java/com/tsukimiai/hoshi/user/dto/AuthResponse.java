package com.tsukimiai.hoshi.user.dto;

public record AuthResponse(
        String accessToken,
        String tokenType,
        long expiresIn,
        UserProfile user) {

    public record UserProfile(Long id, String username, String email, String nickname) {

    }

}
