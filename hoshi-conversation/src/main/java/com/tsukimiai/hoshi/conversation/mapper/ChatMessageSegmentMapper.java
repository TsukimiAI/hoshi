package com.tsukimiai.hoshi.conversation.mapper;

import org.apache.ibatis.annotations.Mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.tsukimiai.hoshi.conversation.entity.ChatMessageSegment;

@Mapper
public interface ChatMessageSegmentMapper extends BaseMapper<ChatMessageSegment> {
}
