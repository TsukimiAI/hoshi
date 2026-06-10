package com.tsukimiai.hoshi.user.dto;

public record RegisterResponse(
        Long userId,
        String email,
        String message) {

}
