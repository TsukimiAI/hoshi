package com.tsukimiai.hoshi.user.service;

import com.tsukimiai.hoshi.user.entity.EmailCodePurpose;

public interface EmailCodeService {

    void sendRegisterCode(String email);

    void sendPasswordResetCode(String email);

    void verifyAndConsume(String email, String code, EmailCodePurpose purpose);

}
