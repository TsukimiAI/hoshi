package com.tsukimiai.hoshi.user.service;

import com.tsukimiai.hoshi.user.entity.RefreshToken;

public interface RefreshTokenService {

    String issueToken(Long userId);

    RefreshToken consumeToken(String rawToken);

    void revokeToken(String rawToken);

}
