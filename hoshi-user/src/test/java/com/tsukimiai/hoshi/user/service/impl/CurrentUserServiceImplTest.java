package com.tsukimiai.hoshi.user.service.impl;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.tsukimiai.hoshi.common.exception.BusinessException;
import com.tsukimiai.hoshi.common.exception.ErrorCode;
import com.tsukimiai.hoshi.user.entity.User;
import com.tsukimiai.hoshi.user.mapper.UserMapper;
import com.tsukimiai.hoshi.user.service.impl.CurrentUserServiceImpl;

@ExtendWith(MockitoExtension.class)
class CurrentUserServiceImplTest {

    @Mock
    private UserMapper userMapper;

    @InjectMocks
    private CurrentUserServiceImpl currentUserService;

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void returnsAuthenticatedUser() {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("tester", "secret"));
        User user = new User();
        user.setUsername("tester");
        when(userMapper.selectOne(org.mockito.ArgumentMatchers.<LambdaQueryWrapper<User>>any()))
                .thenReturn(user);

        User resolved = currentUserService.requireCurrentUser();

        org.assertj.core.api.Assertions.assertThat(resolved.getUsername()).isEqualTo("tester");
    }

    @Test
    void throwsWhenUnauthenticated() {
        assertThatThrownBy(() -> currentUserService.requireCurrentUser())
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> org.assertj.core.api.Assertions.assertThat(
                        ((BusinessException) ex).getErrorCode()).isEqualTo(ErrorCode.UNAUTHORIZED));
    }
}
