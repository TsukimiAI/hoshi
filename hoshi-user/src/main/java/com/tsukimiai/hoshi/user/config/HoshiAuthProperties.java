package com.tsukimiai.hoshi.user.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "hoshi.security")
public class HoshiAuthProperties {

    private long emailVerifyTtlHours = 24;
    private long passwordResetTtlMinutes = 30;
    private long emailCodeTtlMinutes = 10;
    private long emailCodeSendCooldownSeconds = 60;
    private long refreshTokenTtlDays = 30;
    private int loginMaxAttemptsPerMinute = 20;
    private int sendCodeMaxAttemptsPerHour = 10;

    public long getEmailVerifyTtlHours() {
        return emailVerifyTtlHours;
    }

    public void setEmailVerifyTtlHours(long emailVerifyTtlHours) {
        this.emailVerifyTtlHours = emailVerifyTtlHours;
    }

    public long getPasswordResetTtlMinutes() {
        return passwordResetTtlMinutes;
    }

    public void setPasswordResetTtlMinutes(long passwordResetTtlMinutes) {
        this.passwordResetTtlMinutes = passwordResetTtlMinutes;
    }

    public long getEmailCodeTtlMinutes() {
        return emailCodeTtlMinutes;
    }

    public void setEmailCodeTtlMinutes(long emailCodeTtlMinutes) {
        this.emailCodeTtlMinutes = emailCodeTtlMinutes;
    }

    public long getEmailCodeSendCooldownSeconds() {
        return emailCodeSendCooldownSeconds;
    }

    public void setEmailCodeSendCooldownSeconds(long emailCodeSendCooldownSeconds) {
        this.emailCodeSendCooldownSeconds = emailCodeSendCooldownSeconds;
    }

    public long getRefreshTokenTtlDays() {
        return refreshTokenTtlDays;
    }

    public void setRefreshTokenTtlDays(long refreshTokenTtlDays) {
        this.refreshTokenTtlDays = refreshTokenTtlDays;
    }

    public int getLoginMaxAttemptsPerMinute() {
        return loginMaxAttemptsPerMinute;
    }

    public void setLoginMaxAttemptsPerMinute(int loginMaxAttemptsPerMinute) {
        this.loginMaxAttemptsPerMinute = loginMaxAttemptsPerMinute;
    }

    public int getSendCodeMaxAttemptsPerHour() {
        return sendCodeMaxAttemptsPerHour;
    }

    public void setSendCodeMaxAttemptsPerHour(int sendCodeMaxAttemptsPerHour) {
        this.sendCodeMaxAttemptsPerHour = sendCodeMaxAttemptsPerHour;
    }

}
