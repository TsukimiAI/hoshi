package com.tsukimiai.hoshi.conversation.application.proactive;

import java.time.LocalDateTime;
import java.util.Optional;

import org.springframework.stereotype.Component;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.tsukimiai.hoshi.conversation.entity.ProactiveConversationLog;
import com.tsukimiai.hoshi.conversation.mapper.ProactiveConversationLogMapper;

@Component
public class ProactiveReplyTracker {

    private final ProactiveConversationLogMapper proactiveConversationLogMapper;

    public ProactiveReplyTracker(ProactiveConversationLogMapper proactiveConversationLogMapper) {
        this.proactiveConversationLogMapper = proactiveConversationLogMapper;
    }

    public void markResponded(Long sessionId) {
        ProactiveConversationLog log = findOpenLog(sessionId).orElse(null);
        if (log == null || Boolean.TRUE.equals(log.getResponded())) {
            return;
        }
        LocalDateTime now = LocalDateTime.now();
        proactiveConversationLogMapper.update(
                null,
                new LambdaUpdateWrapper<ProactiveConversationLog>()
                        .eq(ProactiveConversationLog::getId, log.getId())
                        .set(ProactiveConversationLog::getResponded, true)
                        .set(ProactiveConversationLog::getRespondedAt, now));
    }

    public Optional<ProactiveConversationLog> findOpenLog(Long sessionId) {
        ProactiveConversationLog log = proactiveConversationLogMapper.selectOne(
                new LambdaQueryWrapper<ProactiveConversationLog>()
                        .eq(ProactiveConversationLog::getSessionId, sessionId)
                        .isNull(ProactiveConversationLog::getEndedAt)
                        .orderByDesc(ProactiveConversationLog::getCreatedAt)
                        .last("LIMIT 1"));
        return Optional.ofNullable(log);
    }

    public void markEnded(Long logId, String endReason) {
        proactiveConversationLogMapper.update(
                null,
                new LambdaUpdateWrapper<ProactiveConversationLog>()
                        .eq(ProactiveConversationLog::getId, logId)
                        .set(ProactiveConversationLog::getEndedAt, LocalDateTime.now())
                        .set(ProactiveConversationLog::getEndReason, endReason));
    }
}
