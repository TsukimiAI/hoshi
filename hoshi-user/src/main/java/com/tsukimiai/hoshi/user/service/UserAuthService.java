package com.tsukimiai.hoshi.user.service;

import com.tsukimiai.hoshi.user.dto.AuthResponse;
import com.tsukimiai.hoshi.user.dto.LoginRequest;
import com.tsukimiai.hoshi.user.dto.RegisterRequest;

public interface UserAuthService {

    AuthResponse register(RegisterRequest request);

    AuthResponse login(LoginRequest request);

}
