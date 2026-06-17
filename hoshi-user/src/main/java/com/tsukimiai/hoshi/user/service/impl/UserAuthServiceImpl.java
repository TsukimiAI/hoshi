package com.tsukimiai.hoshi.user.service.impl;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.Duration;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.beans.factory.ObjectProvider;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.tsukimiai.hoshi.common.exception.BusinessException;
import com.tsukimiai.hoshi.common.exception.ErrorCode;
import com.tsukimiai.hoshi.security.jwt.JwtBlacklistService;
import com.tsukimiai.hoshi.security.jwt.JwtProperties;
import com.tsukimiai.hoshi.security.jwt.JwtTokenProvider;
import com.tsukimiai.hoshi.user.config.HoshiAuthProperties;
import com.tsukimiai.hoshi.user.dto.AuthResponse;
import com.tsukimiai.hoshi.user.dto.ChangePasswordRequest;
import com.tsukimiai.hoshi.user.dto.ForgotPasswordRequest;
import com.tsukimiai.hoshi.user.dto.LoginRequest;
import com.tsukimiai.hoshi.user.dto.LogoutRequest;
import com.tsukimiai.hoshi.user.dto.MessageResponse;
import com.tsukimiai.hoshi.user.dto.RefreshTokenRequest;
import com.tsukimiai.hoshi.user.dto.RegisterRequest;
import com.tsukimiai.hoshi.user.dto.RegisterResponse;
import com.tsukimiai.hoshi.user.dto.ResendVerificationRequest;
import com.tsukimiai.hoshi.user.dto.ResetPasswordByCodeRequest;
import com.tsukimiai.hoshi.user.dto.ResetPasswordRequest;
import com.tsukimiai.hoshi.user.dto.SendRegisterCodeRequest;
import com.tsukimiai.hoshi.user.dto.TokenRequest;
import com.tsukimiai.hoshi.user.entity.EmailCodePurpose;
import com.tsukimiai.hoshi.user.entity.RefreshToken;
import com.tsukimiai.hoshi.user.entity.User;
import com.tsukimiai.hoshi.user.entity.UserToken;
import com.tsukimiai.hoshi.user.entity.UserTokenType;
import com.tsukimiai.hoshi.user.mapper.UserMapper;
import com.tsukimiai.hoshi.user.service.AuthRateLimitService;
import com.tsukimiai.hoshi.user.service.EmailCodeService;
import com.tsukimiai.hoshi.user.service.EmailService;
import com.tsukimiai.hoshi.user.service.RefreshTokenService;
import com.tsukimiai.hoshi.user.service.UserAuthService;
import com.tsukimiai.hoshi.user.service.UserTokenService;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;

@Service
public class UserAuthServiceImpl implements UserAuthService {

    private static final String TOKEN_TYPE = "Bearer";
    private static final String FORGOT_PASSWORD_MESSAGE = "如果该邮箱已注册，我们已发送密码重置邮件";
    private static final String RESET_CODE_SENT_MESSAGE = "如果该邮箱已注册，我们已发送验证码";

    private final UserMapper userMapper;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;
    private final JwtBlacklistService jwtBlacklistService;
    private final JwtProperties jwtProperties;
    private final HoshiAuthProperties authProperties;
    private final UserTokenService userTokenService;
    private final EmailService emailService;
    private final EmailCodeService emailCodeService;
    private final RefreshTokenService refreshTokenService;
    private final AuthRateLimitService authRateLimitService;
    private final MeterRegistry meterRegistry;

    public UserAuthServiceImpl(
            UserMapper userMapper,
            PasswordEncoder passwordEncoder,
            JwtTokenProvider jwtTokenProvider,
            JwtBlacklistService jwtBlacklistService,
            JwtProperties jwtProperties,
            HoshiAuthProperties authProperties,
            UserTokenService userTokenService,
            EmailService emailService,
            EmailCodeService emailCodeService,
            RefreshTokenService refreshTokenService,
            AuthRateLimitService authRateLimitService,
            ObjectProvider<MeterRegistry> meterRegistryProvider) {
        this.userMapper = userMapper;
        this.passwordEncoder = passwordEncoder;
        this.jwtTokenProvider = jwtTokenProvider;
        this.jwtBlacklistService = jwtBlacklistService;
        this.jwtProperties = jwtProperties;
        this.authProperties = authProperties;
        this.userTokenService = userTokenService;
        this.emailService = emailService;
        this.emailCodeService = emailCodeService;
        this.refreshTokenService = refreshTokenService;
        this.authRateLimitService = authRateLimitService;
        this.meterRegistry = meterRegistryProvider.getIfAvailable();
    }

    @Override
    public MessageResponse sendRegisterCode(SendRegisterCodeRequest request) {
        return recordAuth("send_register_code", () -> {
            authRateLimitService.checkSendCodeAllowed(request.email());
            emailCodeService.sendRegisterCode(request.email());
            return new MessageResponse("验证码已发送，请查收邮件");
        });
    }

    @Override
    public MessageResponse sendPasswordResetCode(SendRegisterCodeRequest request) {
        return recordAuth("send_reset_code", () -> {
            authRateLimitService.checkSendCodeAllowed(request.email());
            emailCodeService.sendPasswordResetCode(request.email());
            return new MessageResponse(RESET_CODE_SENT_MESSAGE);
        });
    }

    @Override
    @Transactional
    public RegisterResponse register(RegisterRequest request) {
        return recordAuth("register", () -> {
            boolean exists = userMapper.exists(Wrappers.<User>lambdaQuery()
                    .eq(User::getUsername, request.username())
                    .or()
                    .eq(User::getEmail, request.email()));
            if (exists) {
                throw new BusinessException(ErrorCode.USER_ALREADY_EXISTS);
            }

            emailCodeService.verifyAndConsume(request.email(), request.emailCode(), EmailCodePurpose.REGISTER);

            LocalDateTime now = LocalDateTime.now();
            User user = new User();
            user.setUsername(request.username());
            user.setEmail(request.email().trim().toLowerCase());
            user.setPasswordHash(passwordEncoder.encode(request.password()));
            user.setStatus(1);
            user.setEmailVerified(1);
            user.setEmailVerifiedAt(now);
            user.setCreatedAt(now);
            user.setUpdatedAt(now);
            userMapper.insert(user);

            return new RegisterResponse(
                    user.getId(),
                    user.getEmail(),
                    "注册成功，现在可以登录了");
        });
    }

    @Override
    @Transactional
    public MessageResponse verifyEmail(TokenRequest request) {
        return recordAuth("verify_email", () -> {
            UserToken token = userTokenService.consumeToken(request.token(), UserTokenType.EMAIL_VERIFY);
            User user = requireUser(token.getUserId());
            if (user.hasVerifiedEmail()) {
                throw new BusinessException(ErrorCode.EMAIL_ALREADY_VERIFIED);
            }

            LocalDateTime now = LocalDateTime.now();
            user.setEmailVerified(1);
            user.setEmailVerifiedAt(now);
            user.setUpdatedAt(now);
            userMapper.updateById(user);
            return new MessageResponse("邮箱验证成功，现在可以登录了");
        });
    }

    @Override
    @Transactional
    public MessageResponse resendVerification(ResendVerificationRequest request) {
        return recordAuth("resend_verification", () -> {
            User user = findByEmail(request.email());
            if (user == null) {
                return new MessageResponse("如果该邮箱已注册且未验证，我们已重新发送验证邮件");
            }
            if (user.hasVerifiedEmail()) {
                throw new BusinessException(ErrorCode.EMAIL_ALREADY_VERIFIED);
            }

            String rawToken = userTokenService.issueToken(user.getId(), UserTokenType.EMAIL_VERIFY);
            emailService.sendVerificationEmail(user, rawToken);
            return new MessageResponse("验证邮件已重新发送");
        });
    }

    @Override
    @Transactional
    public MessageResponse forgotPassword(ForgotPasswordRequest request) {
        return recordAuth("forgot_password", () -> {
            User user = findByEmail(request.email());
            if (user != null) {
                String rawToken = userTokenService.issueToken(user.getId(), UserTokenType.PASSWORD_RESET);
                emailService.sendPasswordResetEmail(user, rawToken);
            }
            return new MessageResponse(FORGOT_PASSWORD_MESSAGE);
        });
    }

    @Override
    @Transactional
    public MessageResponse resetPassword(ResetPasswordRequest request) {
        return recordAuth("reset_password", () -> {
            UserToken token = userTokenService.consumeToken(request.token(), UserTokenType.PASSWORD_RESET);
            User user = requireUser(token.getUserId());
            updatePassword(user, request.newPassword());
            return new MessageResponse("密码重置成功，请使用新密码登录");
        });
    }

    @Override
    @Transactional
    public MessageResponse resetPasswordByCode(ResetPasswordByCodeRequest request) {
        return recordAuth("reset_password_by_code", () -> {
            emailCodeService.verifyAndConsume(request.email(), request.emailCode(), EmailCodePurpose.PASSWORD_RESET);
            User user = findByEmail(request.email());
            if (user == null) {
                throw new BusinessException(ErrorCode.USER_NOT_FOUND);
            }
            updatePassword(user, request.newPassword());
            return new MessageResponse("密码重置成功，请使用新密码登录");
        });
    }

    @Override
    @Transactional
    public AuthResponse login(LoginRequest request, String clientKey) {
        return recordAuth("login", () -> {
            authRateLimitService.checkLoginAllowed(clientKey);

            User user = userMapper.selectOne(Wrappers.<User>lambdaQuery()
                    .eq(User::getUsername, request.usernameOrEmail())
                    .or()
                    .eq(User::getEmail, request.usernameOrEmail()));
            if (user == null || !passwordEncoder.matches(request.password(), user.getPasswordHash())) {
                throw new BusinessException(ErrorCode.INVALID_CREDENTIALS);
            }
            if (!user.hasVerifiedEmail()) {
                throw new BusinessException(ErrorCode.EMAIL_NOT_VERIFIED);
            }

            LocalDateTime now = LocalDateTime.now();
            user.setLastLoginAt(now);
            user.setUpdatedAt(now);
            userMapper.updateById(user);
            return buildAuthResponse(user);
        });
    }

    @Override
    @Transactional
    public AuthResponse refresh(RefreshTokenRequest request) {
        return recordAuth("refresh", () -> {
            RefreshToken refreshToken = refreshTokenService.consumeToken(request.refreshToken());
            recordRefreshConsumed("success");
            User user = requireUser(refreshToken.getUserId());
            return buildAuthResponse(user);
        }, ex -> {
            recordRefreshConsumed("failure");
            throw ex;
        });
    }

    @Override
    public MessageResponse logout(LogoutRequest request, String accessToken) {
        return recordAuth("logout", () -> {
            refreshTokenService.revokeToken(request.refreshToken());
            if (accessToken != null && !accessToken.isBlank()) {
                jwtTokenProvider.blacklistAccessToken(accessToken, jwtBlacklistService);
                recordLogoutBlacklisted();
            }
            return new MessageResponse("已退出登录");
        });
    }

    @Override
    public AuthResponse.UserProfile getCurrentUser() {
        return recordAuth("me", () -> {
            Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
            if (authentication == null || !authentication.isAuthenticated()) {
                throw new BusinessException(ErrorCode.UNAUTHORIZED);
            }
            String username = authentication.getName();
            if (username == null || username.isBlank()) {
                throw new BusinessException(ErrorCode.UNAUTHORIZED);
            }
            User user = userMapper.selectOne(Wrappers.<User>lambdaQuery().eq(User::getUsername, username));
            if (user == null) {
                throw new BusinessException(ErrorCode.USER_NOT_FOUND);
            }
            return toUserProfile(user);
        });
    }

    @Override
    @Transactional
    public MessageResponse changePassword(ChangePasswordRequest request) {
        return recordAuth("change_password", () -> {
            User user = requireAuthenticatedUser();
            if (!passwordEncoder.matches(request.currentPassword(), user.getPasswordHash())) {
                throw new BusinessException(ErrorCode.INVALID_CREDENTIALS, "当前密码不正确");
            }
            updatePassword(user, request.newPassword());
            refreshTokenService.revokeAllForUser(user.getId());
            return new MessageResponse("密码修改成功，请重新登录");
        });
    }

    private void recordRefreshConsumed(String outcome) {
        if (meterRegistry == null) {
            return;
        }
        meterRegistry.counter(
                "hoshi.auth.refresh.consumed.total",
                "outcome", outcome)
                .increment();
    }

    private void recordLogoutBlacklisted() {
        if (meterRegistry == null) {
            return;
        }
        meterRegistry.counter("hoshi.auth.logout.blacklisted.total").increment();
    }

    private <T> T recordAuth(String action, java.util.concurrent.Callable<T> block) {
        return recordAuth(action, block, ex -> {
            throw ex;
        });
    }

    private <T> T recordAuth(
            String action,
            java.util.concurrent.Callable<T> block,
            java.util.function.Function<RuntimeException, T> errorMapper) {
        long startTime = System.nanoTime();
        try {
            T result = block.call();
            recordAuthOutcome(action, "success", null, startTime);
            return result;
        } catch (BusinessException ex) {
            recordAuthOutcome(action, "failure", ex.getErrorCode(), startTime);
            throw ex;
        } catch (RuntimeException ex) {
            recordAuthOutcome(action, "failure", ErrorCode.INTERNAL_ERROR, startTime);
            return errorMapper.apply(ex);
        } catch (Exception ex) {
            recordAuthOutcome(action, "failure", ErrorCode.INTERNAL_ERROR, startTime);
            throw new IllegalStateException(ex);
        }
    }

    private void recordAuthOutcome(String action, String outcome, ErrorCode errorCode, long startTime) {
        if (meterRegistry == null) {
            return;
        }
        String errorCodeTag = errorCode == null ? "0" : Integer.toString(errorCode.getCode());
        meterRegistry.counter(
                "hoshi.auth.requests.total",
                "action", action,
                "outcome", outcome)
                .increment();
        Timer.builder("hoshi.auth.request.duration")
                .description("Latency of auth requests")
                .tag("action", action)
                .tag("outcome", outcome)
                .register(meterRegistry)
                .record(Duration.ofNanos(System.nanoTime() - startTime));
        if (!"success".equals(outcome)) {
            meterRegistry.counter(
                    "hoshi.auth.failures.total",
                    "action", action,
                    "error_code", errorCodeTag)
                    .increment();
        }
    }

    private User requireAuthenticatedUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        }
        String username = authentication.getName();
        if (username == null || username.isBlank()) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        }
        User user = userMapper.selectOne(Wrappers.<User>lambdaQuery().eq(User::getUsername, username));
        if (user == null) {
            throw new BusinessException(ErrorCode.USER_NOT_FOUND);
        }
        return user;
    }

    private void updatePassword(User user, String newPassword) {
        LocalDateTime now = LocalDateTime.now();
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        user.setUpdatedAt(now);
        userMapper.updateById(user);
    }

    private User findByEmail(String email) {
        return userMapper.selectOne(Wrappers.<User>lambdaQuery().eq(User::getEmail, email.trim().toLowerCase()));
    }

    private User requireUser(Long userId) {
        User user = userMapper.selectById(userId);
        if (user == null) {
            throw new BusinessException(ErrorCode.USER_NOT_FOUND);
        }
        return user;
    }

    private AuthResponse buildAuthResponse(User user) {
        String accessToken = jwtTokenProvider.createAccessToken(user.getId(), user.getUsername());
        String refreshToken = refreshTokenService.issueToken(user.getId());
        long refreshExpiresIn = authProperties.getRefreshTokenTtlDays() * 24 * 60 * 60;
        return new AuthResponse(
                accessToken,
                refreshToken,
                TOKEN_TYPE,
                jwtProperties.getAccessTokenTtlSeconds(),
                refreshExpiresIn,
                toUserProfile(user));
    }

    private AuthResponse.UserProfile toUserProfile(User user) {
        return new AuthResponse.UserProfile(
                user.getId(),
                user.getUsername(),
                user.getEmail(),
                user.getAvatarUrl(),
                user.hasVerifiedEmail(),
                formatDateTime(user.getCreatedAt()),
                formatDateTime(user.getLastLoginAt()));
    }

    private String formatDateTime(LocalDateTime value) {
        if (value == null) {
            return null;
        }
        return value.format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
    }

}
