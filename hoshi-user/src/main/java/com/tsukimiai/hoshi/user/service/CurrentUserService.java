package com.tsukimiai.hoshi.user.service;

import com.tsukimiai.hoshi.user.entity.User;

/**
 * Resolves the authenticated user for request-scoped operations.
 * Other modules should depend on this service instead of {@code UserMapper}.
 */
public interface CurrentUserService {

    User requireCurrentUser();
}
