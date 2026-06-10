package com.tsukimiai.hoshi.user.service;

import com.tsukimiai.hoshi.user.entity.User;

public interface EmailService {

    void sendVerificationEmail(User user, String rawToken);

    void sendRegisterCode(String email, String code);

    void sendPasswordResetCode(String email, String code);

    void sendPasswordResetEmail(User user, String rawToken);

}
