package com.tsukimiai.hoshi.security.jwt;

public interface JwtBlacklistService {

    void blacklist(String jti, long ttlSeconds);

    boolean isBlacklisted(String jti);

}
