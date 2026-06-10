package com.tsukimiai.hoshi.security.jwt;

public class NoOpJwtBlacklistService implements JwtBlacklistService {

    @Override
    public void blacklist(String jti, long ttlSeconds) {
        // no-op when Redis is unavailable (e.g. tests)
    }

    @Override
    public boolean isBlacklisted(String jti) {
        return false;
    }

}
