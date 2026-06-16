package com.tsukimiai.hoshi.conversation.mapper;

import org.apache.ibatis.annotations.Mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.tsukimiai.hoshi.conversation.entity.UserProactivePreferences;

@Mapper
public interface UserProactivePreferencesMapper extends BaseMapper<UserProactivePreferences> {
}
