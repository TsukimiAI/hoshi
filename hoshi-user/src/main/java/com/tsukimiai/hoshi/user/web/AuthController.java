package com.tsukimiai.hoshi.user.web;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.tsukimiai.hoshi.common.api.ApiResponse;
import com.tsukimiai.hoshi.security.jwt.BearerTokenResolver;
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
import com.tsukimiai.hoshi.user.service.UserAuthService;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final UserAuthService userAuthService;

    public AuthController(UserAuthService userAuthService) {
        this.userAuthService = userAuthService;
    }

    @PostMapping("/send-register-code")
    public ApiResponse<MessageResponse> sendRegisterCode(@Valid @RequestBody SendRegisterCodeRequest request) {
        return ApiResponse.ok(userAuthService.sendRegisterCode(request));
    }

    @PostMapping("/send-reset-code")
    public ApiResponse<MessageResponse> sendPasswordResetCode(@Valid @RequestBody SendRegisterCodeRequest request) {
        return ApiResponse.ok(userAuthService.sendPasswordResetCode(request));
    }

    @PostMapping("/register")
    public ApiResponse<RegisterResponse> register(@Valid @RequestBody RegisterRequest request) {
        return ApiResponse.ok(userAuthService.register(request));
    }

    @PostMapping("/verify-email")
    public ApiResponse<MessageResponse> verifyEmail(@Valid @RequestBody TokenRequest request) {
        return ApiResponse.ok(userAuthService.verifyEmail(request));
    }

    @PostMapping("/resend-verification")
    public ApiResponse<MessageResponse> resendVerification(@Valid @RequestBody ResendVerificationRequest request) {
        return ApiResponse.ok(userAuthService.resendVerification(request));
    }

    @PostMapping("/forgot-password")
    public ApiResponse<MessageResponse> forgotPassword(@Valid @RequestBody ForgotPasswordRequest request) {
        return ApiResponse.ok(userAuthService.forgotPassword(request));
    }

    @PostMapping("/reset-password")
    public ApiResponse<MessageResponse> resetPassword(@Valid @RequestBody ResetPasswordRequest request) {
        return ApiResponse.ok(userAuthService.resetPassword(request));
    }

    @PostMapping("/reset-password-by-code")
    public ApiResponse<MessageResponse> resetPasswordByCode(@Valid @RequestBody ResetPasswordByCodeRequest request) {
        return ApiResponse.ok(userAuthService.resetPasswordByCode(request));
    }

    @PostMapping("/login")
    public ApiResponse<AuthResponse> login(@Valid @RequestBody LoginRequest request, HttpServletRequest httpRequest) {
        String clientKey = RequestClientResolver.resolveClientKey(httpRequest);
        return ApiResponse.ok(userAuthService.login(request, clientKey));
    }

    @PostMapping("/refresh")
    public ApiResponse<AuthResponse> refresh(@Valid @RequestBody RefreshTokenRequest request) {
        return ApiResponse.ok(userAuthService.refresh(request));
    }

    @PostMapping("/logout")
    public ApiResponse<MessageResponse> logout(
            @Valid @RequestBody LogoutRequest request,
            HttpServletRequest httpRequest) {
        String accessToken = BearerTokenResolver.resolve(httpRequest);
        return ApiResponse.ok(userAuthService.logout(request, accessToken));
    }

    @GetMapping("/me")
    public ApiResponse<AuthResponse.UserProfile> me() {
        return ApiResponse.ok(userAuthService.getCurrentUser());
    }

}
