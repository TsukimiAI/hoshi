package com.tsukimiai.hoshi.user.service.impl;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.tsukimiai.hoshi.common.exception.BusinessException;
import com.tsukimiai.hoshi.common.exception.ErrorCode;
import com.tsukimiai.hoshi.user.entity.User;
import com.tsukimiai.hoshi.user.mapper.UserMapper;
import com.tsukimiai.hoshi.user.service.CurrentUserService;

@Service
public class CurrentUserServiceImpl implements CurrentUserService {

    private final UserMapper userMapper;

    public CurrentUserServiceImpl(UserMapper userMapper) {
        this.userMapper = userMapper;
    }

    @Override
    public User requireCurrentUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || authentication.getName() == null || authentication.getName().isBlank()) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        }
        User user = userMapper.selectOne(new LambdaQueryWrapper<User>()
                .eq(User::getUsername, authentication.getName())
                .last("LIMIT 1"));
        if (user == null) {
            throw new BusinessException(ErrorCode.USER_NOT_FOUND);
        }
        return user;
    }
}
