package com.tsukimiai.hoshi.user.service.impl;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.HexFormat;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.tsukimiai.hoshi.common.exception.BusinessException;
import com.tsukimiai.hoshi.common.exception.ErrorCode;
import com.tsukimiai.hoshi.user.config.HoshiAuthProperties;
import com.tsukimiai.hoshi.user.entity.RefreshToken;
import com.tsukimiai.hoshi.user.mapper.RefreshTokenMapper;
import com.tsukimiai.hoshi.user.service.RefreshTokenService;

@Service
public class RefreshTokenServiceImpl implements RefreshTokenService {

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private final RefreshTokenMapper refreshTokenMapper;
    private final HoshiAuthProperties authProperties;

    public RefreshTokenServiceImpl(RefreshTokenMapper refreshTokenMapper, HoshiAuthProperties authProperties) {
        this.refreshTokenMapper = refreshTokenMapper;
        this.authProperties = authProperties;
    }

    @Override
    @Transactional
    public String issueToken(Long userId) {
        String rawToken = generateRawToken();
        LocalDateTime now = LocalDateTime.now();
        RefreshToken token = new RefreshToken();
        token.setUserId(userId);
        token.setTokenHash(hashToken(rawToken));
        token.setExpiresAt(now.plusDays(authProperties.getRefreshTokenTtlDays()));
        token.setCreatedAt(now);
        refreshTokenMapper.insert(token);
        return rawToken;
    }

    @Override
    @Transactional
    public RefreshToken consumeToken(String rawToken) {
        RefreshToken token = findActiveToken(rawToken);
        if (token == null) {
            throw new BusinessException(ErrorCode.INVALID_REFRESH_TOKEN);
        }
        token.setRevokedAt(LocalDateTime.now());
        refreshTokenMapper.updateById(token);
        return token;
    }

    @Override
    @Transactional
    public void revokeToken(String rawToken) {
        RefreshToken token = findActiveToken(rawToken);
        if (token == null) {
            return;
        }
        token.setRevokedAt(LocalDateTime.now());
        refreshTokenMapper.updateById(token);
    }

    private RefreshToken findActiveToken(String rawToken) {
        LocalDateTime now = LocalDateTime.now();
        return refreshTokenMapper.selectOne(Wrappers.<RefreshToken>lambdaQuery()
                .eq(RefreshToken::getTokenHash, hashToken(rawToken))
                .isNull(RefreshToken::getRevokedAt)
                .gt(RefreshToken::getExpiresAt, now));
    }

    private String generateRawToken() {
        byte[] bytes = new byte[32];
        SECURE_RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String hashToken(String rawToken) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(rawToken.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 not available", ex);
        }
    }

}
