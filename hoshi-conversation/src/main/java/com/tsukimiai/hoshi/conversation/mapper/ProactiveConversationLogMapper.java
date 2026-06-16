package com.tsukimiai.hoshi.conversation.mapper;

import org.apache.ibatis.annotations.Mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.tsukimiai.hoshi.conversation.entity.ProactiveConversationLog;

@Mapper
public interface ProactiveConversationLogMapper extends BaseMapper<ProactiveConversationLog> {
}
