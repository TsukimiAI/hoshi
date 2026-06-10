package com.tsukimiai.hoshi.user.service.impl;

import java.time.LocalDateTime;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.tsukimiai.hoshi.common.exception.BusinessException;
import com.tsukimiai.hoshi.common.exception.ErrorCode;
import com.tsukimiai.hoshi.security.jwt.JwtBlacklistService;
import com.tsukimiai.hoshi.security.jwt.JwtProperties;
import com.tsukimiai.hoshi.security.jwt.JwtTokenProvider;
import com.tsukimiai.hoshi.user.config.HoshiAuthProperties;
import com.tsukimiai.hoshi.user.dto.AuthResponse;
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
            AuthRateLimitService authRateLimitService) {
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
    }

    @Override
    public MessageResponse sendRegisterCode(SendRegisterCodeRequest request) {
        authRateLimitService.checkSendCodeAllowed(request.email());
        emailCodeService.sendRegisterCode(request.email());
        return new MessageResponse("验证码已发送，请查收邮件");
    }

    @Override
    public MessageResponse sendPasswordResetCode(SendRegisterCodeRequest request) {
        authRateLimitService.checkSendCodeAllowed(request.email());
        emailCodeService.sendPasswordResetCode(request.email());
        return new MessageResponse(RESET_CODE_SENT_MESSAGE);
    }

    @Override
    @Transactional
    public RegisterResponse register(RegisterRequest request) {
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
    }

    @Override
    @Transactional
    public MessageResponse verifyEmail(TokenRequest request) {
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
    }

    @Override
    @Transactional
    public MessageResponse resendVerification(ResendVerificationRequest request) {
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
    }

    @Override
    @Transactional
    public MessageResponse forgotPassword(ForgotPasswordRequest request) {
        User user = findByEmail(request.email());
        if (user != null) {
            String rawToken = userTokenService.issueToken(user.getId(), UserTokenType.PASSWORD_RESET);
            emailService.sendPasswordResetEmail(user, rawToken);
        }
        return new MessageResponse(FORGOT_PASSWORD_MESSAGE);
    }

    @Override
    @Transactional
    public MessageResponse resetPassword(ResetPasswordRequest request) {
        UserToken token = userTokenService.consumeToken(request.token(), UserTokenType.PASSWORD_RESET);
        User user = requireUser(token.getUserId());
        updatePassword(user, request.newPassword());
        return new MessageResponse("密码重置成功，请使用新密码登录");
    }

    @Override
    @Transactional
    public MessageResponse resetPasswordByCode(ResetPasswordByCodeRequest request) {
        emailCodeService.verifyAndConsume(request.email(), request.emailCode(), EmailCodePurpose.PASSWORD_RESET);
        User user = findByEmail(request.email());
        if (user == null) {
            throw new BusinessException(ErrorCode.USER_NOT_FOUND);
        }
        updatePassword(user, request.newPassword());
        return new MessageResponse("密码重置成功，请使用新密码登录");
    }

    @Override
    @Transactional
    public AuthResponse login(LoginRequest request, String clientKey) {
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
    }

    @Override
    @Transactional
    public AuthResponse refresh(RefreshTokenRequest request) {
        RefreshToken refreshToken = refreshTokenService.consumeToken(request.refreshToken());
        User user = requireUser(refreshToken.getUserId());
        return buildAuthResponse(user);
    }

    @Override
    public MessageResponse logout(LogoutRequest request, String accessToken) {
        refreshTokenService.revokeToken(request.refreshToken());
        if (accessToken != null && !accessToken.isBlank()) {
            jwtTokenProvider.blacklistAccessToken(accessToken, jwtBlacklistService);
        }
        return new MessageResponse("已退出登录");
    }

    @Override
    public AuthResponse.UserProfile getCurrentUser() {
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
                user.hasVerifiedEmail());
    }

}
