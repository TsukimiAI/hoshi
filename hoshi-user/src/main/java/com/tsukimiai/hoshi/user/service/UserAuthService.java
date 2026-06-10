package com.tsukimiai.hoshi.user.service;

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

public interface UserAuthService {

    MessageResponse sendRegisterCode(SendRegisterCodeRequest request);

    MessageResponse sendPasswordResetCode(SendRegisterCodeRequest request);

    RegisterResponse register(RegisterRequest request);

    MessageResponse verifyEmail(TokenRequest request);

    MessageResponse resendVerification(ResendVerificationRequest request);

    MessageResponse forgotPassword(ForgotPasswordRequest request);

    MessageResponse resetPassword(ResetPasswordRequest request);

    MessageResponse resetPasswordByCode(ResetPasswordByCodeRequest request);

    AuthResponse login(LoginRequest request, String clientKey);

    AuthResponse refresh(RefreshTokenRequest request);

    MessageResponse logout(LogoutRequest request, String accessToken);

    AuthResponse.UserProfile getCurrentUser();

}
