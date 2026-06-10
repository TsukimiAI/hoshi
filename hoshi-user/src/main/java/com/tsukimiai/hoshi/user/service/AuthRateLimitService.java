package com.tsukimiai.hoshi.user.service;

public interface AuthRateLimitService {

    void checkLoginAllowed(String clientKey);

    void checkSendCodeAllowed(String email);

}
