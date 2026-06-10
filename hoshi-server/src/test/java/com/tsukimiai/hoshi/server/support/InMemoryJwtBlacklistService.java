package com.tsukimiai.hoshi.server.support;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import com.tsukimiai.hoshi.security.jwt.JwtBlacklistService;

public class InMemoryJwtBlacklistService implements JwtBlacklistService {

    private final Map<String, Long> expiresAtByJti = new ConcurrentHashMap<>();

    @Override
    public void blacklist(String jti, long ttlSeconds) {
        if (jti == null || jti.isBlank() || ttlSeconds <= 0) {
            return;
        }
        expiresAtByJti.put(jti, System.currentTimeMillis() + ttlSeconds * 1000);
    }

    @Override
    public boolean isBlacklisted(String jti) {
        if (jti == null || jti.isBlank()) {
            return false;
        }
        Long expiresAt = expiresAtByJti.get(jti);
        if (expiresAt == null) {
            return false;
        }
        if (System.currentTimeMillis() > expiresAt) {
            expiresAtByJti.remove(jti);
            return false;
        }
        return true;
    }

}
