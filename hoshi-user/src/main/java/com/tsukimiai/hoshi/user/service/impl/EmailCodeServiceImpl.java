package com.tsukimiai.hoshi.user.service.impl;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.HexFormat;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.tsukimiai.hoshi.common.exception.BusinessException;
import com.tsukimiai.hoshi.common.exception.ErrorCode;
import com.tsukimiai.hoshi.user.config.HoshiAuthProperties;
import com.tsukimiai.hoshi.user.entity.EmailCode;
import com.tsukimiai.hoshi.user.entity.EmailCodePurpose;
import com.tsukimiai.hoshi.user.entity.User;
import com.tsukimiai.hoshi.user.mapper.EmailCodeMapper;
import com.tsukimiai.hoshi.user.mapper.UserMapper;
import com.tsukimiai.hoshi.user.service.EmailCodeService;
import com.tsukimiai.hoshi.user.service.EmailService;

@Service
public class EmailCodeServiceImpl implements EmailCodeService {

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private final EmailCodeMapper emailCodeMapper;
    private final UserMapper userMapper;
    private final EmailService emailService;
    private final HoshiAuthProperties authProperties;

    public EmailCodeServiceImpl(
            EmailCodeMapper emailCodeMapper,
            UserMapper userMapper,
            EmailService emailService,
            HoshiAuthProperties authProperties) {
        this.emailCodeMapper = emailCodeMapper;
        this.userMapper = userMapper;
        this.emailService = emailService;
        this.authProperties = authProperties;
    }

    @Override
    @Transactional
    public void sendRegisterCode(String email) {
        String normalizedEmail = normalizeEmail(email);
        if (userMapper.exists(Wrappers.<User>lambdaQuery().eq(User::getEmail, normalizedEmail))) {
            throw new BusinessException(ErrorCode.USER_ALREADY_EXISTS);
        }

        LocalDateTime now = LocalDateTime.now();
        if (isInCooldown(normalizedEmail, EmailCodePurpose.REGISTER, now)) {
            throw new BusinessException(ErrorCode.EMAIL_CODE_SEND_TOO_FREQUENT);
        }

        invalidateActiveCodes(normalizedEmail, EmailCodePurpose.REGISTER, now);

        String code = generateCode();
        EmailCode record = new EmailCode();
        record.setEmail(normalizedEmail);
        record.setCodeHash(hashCode(code));
        record.setPurpose(EmailCodePurpose.REGISTER.name());
        record.setExpiresAt(now.plusMinutes(authProperties.getEmailCodeTtlMinutes()));
        record.setCreatedAt(now);
        emailCodeMapper.insert(record);

        emailService.sendRegisterCode(normalizedEmail, code);
    }

    @Override
    @Transactional
    public void sendPasswordResetCode(String email) {
        String normalizedEmail = normalizeEmail(email);
        User user = userMapper.selectOne(Wrappers.<User>lambdaQuery().eq(User::getEmail, normalizedEmail));
        if (user == null) {
            return;
        }

        LocalDateTime now = LocalDateTime.now();
        if (isInCooldown(normalizedEmail, EmailCodePurpose.PASSWORD_RESET, now)) {
            throw new BusinessException(ErrorCode.EMAIL_CODE_SEND_TOO_FREQUENT);
        }

        invalidateActiveCodes(normalizedEmail, EmailCodePurpose.PASSWORD_RESET, now);

        String code = generateCode();
        EmailCode record = new EmailCode();
        record.setEmail(normalizedEmail);
        record.setCodeHash(hashCode(code));
        record.setPurpose(EmailCodePurpose.PASSWORD_RESET.name());
        record.setExpiresAt(now.plusMinutes(authProperties.getEmailCodeTtlMinutes()));
        record.setCreatedAt(now);
        emailCodeMapper.insert(record);

        emailService.sendPasswordResetCode(normalizedEmail, code);
    }

    @Override
    @Transactional
    public void verifyAndConsume(String email, String code, EmailCodePurpose purpose) {
        String normalizedEmail = normalizeEmail(email);
        LocalDateTime now = LocalDateTime.now();
        EmailCode record = emailCodeMapper.selectOne(Wrappers.<EmailCode>lambdaQuery()
                .eq(EmailCode::getEmail, normalizedEmail)
                .eq(EmailCode::getCodeHash, hashCode(code))
                .eq(EmailCode::getPurpose, purpose.name())
                .isNull(EmailCode::getUsedAt)
                .gt(EmailCode::getExpiresAt, now)
                .orderByDesc(EmailCode::getCreatedAt)
                .last("LIMIT 1"));
        if (record == null) {
            throw new BusinessException(ErrorCode.INVALID_EMAIL_CODE);
        }

        record.setUsedAt(now);
        emailCodeMapper.updateById(record);
    }

    private boolean isInCooldown(String email, EmailCodePurpose purpose, LocalDateTime now) {
        EmailCode latest = emailCodeMapper.selectOne(Wrappers.<EmailCode>lambdaQuery()
                .eq(EmailCode::getEmail, email)
                .eq(EmailCode::getPurpose, purpose.name())
                .isNull(EmailCode::getUsedAt)
                .gt(EmailCode::getExpiresAt, now)
                .orderByDesc(EmailCode::getCreatedAt)
                .last("LIMIT 1"));
        return latest != null
                && latest.getCreatedAt().isAfter(now.minusSeconds(authProperties.getEmailCodeSendCooldownSeconds()));
    }

    private void invalidateActiveCodes(String email, EmailCodePurpose purpose, LocalDateTime now) {
        emailCodeMapper.update(null, Wrappers.<EmailCode>lambdaUpdate()
                .set(EmailCode::getUsedAt, now)
                .eq(EmailCode::getEmail, email)
                .eq(EmailCode::getPurpose, purpose.name())
                .isNull(EmailCode::getUsedAt)
                .gt(EmailCode::getExpiresAt, now));
    }

    private String normalizeEmail(String email) {
        return email.trim().toLowerCase();
    }

    private String generateCode() {
        int value = 100000 + SECURE_RANDOM.nextInt(900000);
        return String.valueOf(value);
    }

    private String hashCode(String code) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(code.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 not available", ex);
        }
    }

}
