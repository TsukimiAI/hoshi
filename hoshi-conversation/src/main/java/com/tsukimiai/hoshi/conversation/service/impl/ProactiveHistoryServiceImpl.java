package com.tsukimiai.hoshi.conversation.service.impl;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.tsukimiai.hoshi.conversation.dto.ProactiveHistoryResponse;
import com.tsukimiai.hoshi.conversation.entity.ProactiveConversationLog;
import com.tsukimiai.hoshi.conversation.mapper.ProactiveConversationLogMapper;
import com.tsukimiai.hoshi.conversation.service.ProactiveHistoryService;
import com.tsukimiai.hoshi.user.entity.User;

@Service
@Transactional(readOnly = true)
public class ProactiveHistoryServiceImpl implements ProactiveHistoryService {

    private final ProactiveConversationLogMapper proactiveConversationLogMapper;

    public ProactiveHistoryServiceImpl(ProactiveConversationLogMapper proactiveConversationLogMapper) {
        this.proactiveConversationLogMapper = proactiveConversationLogMapper;
    }

    @Override
    public List<ProactiveHistoryResponse> listRecent(User user, int limit, int offset) {
        int effectiveLimit = Math.min(Math.max(limit, 1), 50);
        int effectiveOffset = Math.max(offset, 0);
        List<ProactiveConversationLog> logs = proactiveConversationLogMapper.selectList(
                new LambdaQueryWrapper<ProactiveConversationLog>()
                        .eq(ProactiveConversationLog::getUserId, user.getId())
                        .orderByDesc(ProactiveConversationLog::getCreatedAt)
                        .orderByDesc(ProactiveConversationLog::getId)
                        .last("LIMIT " + effectiveLimit + " OFFSET " + effectiveOffset));
        return logs.stream().map(ProactiveHistoryResponse::from).toList();
    }
}
