package com.tsukimiai.hoshi.user.service;

import com.tsukimiai.hoshi.user.entity.UserToken;
import com.tsukimiai.hoshi.user.entity.UserTokenType;

public interface UserTokenService {

    String issueToken(Long userId, UserTokenType tokenType);

    UserToken consumeToken(String rawToken, UserTokenType tokenType);

}
