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
import com.tsukimiai.hoshi.user.entity.UserToken;
import com.tsukimiai.hoshi.user.entity.UserTokenType;
import com.tsukimiai.hoshi.user.mapper.UserTokenMapper;
import com.tsukimiai.hoshi.user.service.UserTokenService;

@Service
public class UserTokenServiceImpl implements UserTokenService {

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private final UserTokenMapper userTokenMapper;
    private final HoshiAuthProperties authProperties;

    public UserTokenServiceImpl(UserTokenMapper userTokenMapper, HoshiAuthProperties authProperties) {
        this.userTokenMapper = userTokenMapper;
        this.authProperties = authProperties;
    }

    @Override
    @Transactional
    public String issueToken(Long userId, UserTokenType tokenType) {
        invalidateActiveTokens(userId, tokenType);

        String rawToken = generateRawToken();
        LocalDateTime now = LocalDateTime.now();
        UserToken token = new UserToken();
        token.setUserId(userId);
        token.setTokenType(tokenType.name());
        token.setTokenHash(hashToken(rawToken));
        token.setExpiresAt(now.plus(resolveTtl(tokenType)));
        token.setCreatedAt(now);
        userTokenMapper.insert(token);
        return rawToken;
    }

    @Override
    @Transactional
    public UserToken consumeToken(String rawToken, UserTokenType tokenType) {
        UserToken token = userTokenMapper.selectOne(Wrappers.<UserToken>lambdaQuery()
                .eq(UserToken::getTokenHash, hashToken(rawToken))
                .eq(UserToken::getTokenType, tokenType.name()));
        if (token == null || token.getUsedAt() != null || token.getExpiresAt().isBefore(LocalDateTime.now())) {
            throw new BusinessException(ErrorCode.INVALID_OR_EXPIRED_TOKEN);
        }

        token.setUsedAt(LocalDateTime.now());
        userTokenMapper.updateById(token);
        return token;
    }

    private void invalidateActiveTokens(Long userId, UserTokenType tokenType) {
        LocalDateTime now = LocalDateTime.now();
        userTokenMapper.update(null, Wrappers.<UserToken>lambdaUpdate()
                .set(UserToken::getUsedAt, now)
                .eq(UserToken::getUserId, userId)
                .eq(UserToken::getTokenType, tokenType.name())
                .isNull(UserToken::getUsedAt)
                .gt(UserToken::getExpiresAt, now));
    }

    private java.time.Duration resolveTtl(UserTokenType tokenType) {
        return switch (tokenType) {
            case EMAIL_VERIFY -> java.time.Duration.ofHours(authProperties.getEmailVerifyTtlHours());
            case PASSWORD_RESET -> java.time.Duration.ofMinutes(authProperties.getPasswordResetTtlMinutes());
        };
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
