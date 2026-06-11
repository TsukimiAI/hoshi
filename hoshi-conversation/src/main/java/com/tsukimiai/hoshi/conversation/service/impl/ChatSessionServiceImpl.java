package com.tsukimiai.hoshi.conversation.service.impl;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.tsukimiai.hoshi.common.exception.BusinessException;
import com.tsukimiai.hoshi.common.exception.ErrorCode;
import com.tsukimiai.hoshi.conversation.entity.ChatSession;
import com.tsukimiai.hoshi.conversation.mapper.ChatSessionMapper;
import com.tsukimiai.hoshi.conversation.service.ChatSessionService;
import com.tsukimiai.hoshi.user.entity.User;

@Service
@Transactional
public class ChatSessionServiceImpl implements ChatSessionService {

    private static final String DEFAULT_SESSION_TITLE = "和星奈";
    private static final String NEW_SESSION_TITLE = "新会话";

    private final ChatSessionMapper chatSessionMapper;

    public ChatSessionServiceImpl(ChatSessionMapper chatSessionMapper) {
        this.chatSessionMapper = chatSessionMapper;
    }

    @Override
    public List<ChatSession> listByUser(User user) {
        List<ChatSession> sessions = listSessions(user.getId());
        if (!sessions.isEmpty()) {
            return sessions;
        }
        createSession(user.getId(), DEFAULT_SESSION_TITLE);
        return listSessions(user.getId());
    }

    @Override
    public ChatSession create(User user, String title) {
        ChatSession session = createSession(user.getId(), normalizedTitle(title, NEW_SESSION_TITLE));
        return getOwnedSession(user.getId(), session.getId());
    }

    @Override
    @Transactional(readOnly = true)
    public ChatSession get(User user, Long sessionId) {
        return getOwnedSession(user.getId(), sessionId);
    }

    @Override
    public ChatSession updateTitle(User user, Long sessionId, String title) {
        ChatSession session = getOwnedSession(user.getId(), sessionId);
        session.setTitle(title.trim());
        chatSessionMapper.updateById(session);
        return getOwnedSession(user.getId(), sessionId);
    }

    @Override
    public void delete(User user, Long sessionId) {
        getOwnedSession(user.getId(), sessionId);
        chatSessionMapper.deleteById(sessionId);
    }

    private ChatSession createSession(Long userId, String title) {
        ChatSession session = new ChatSession();
        session.setUserId(userId);
        session.setTitle(title);
        chatSessionMapper.insert(session);
        return session;
    }

    private List<ChatSession> listSessions(Long userId) {
        return chatSessionMapper.selectList(new LambdaQueryWrapper<ChatSession>()
                .eq(ChatSession::getUserId, userId)
                .orderByDesc(ChatSession::getUpdatedAt)
                .orderByDesc(ChatSession::getId));
    }

    private ChatSession getOwnedSession(Long userId, Long sessionId) {
        ChatSession session = chatSessionMapper.selectById(sessionId);
        if (session == null) {
            throw new BusinessException(ErrorCode.CHAT_SESSION_NOT_FOUND);
        }
        if (!userId.equals(session.getUserId())) {
            throw new BusinessException(ErrorCode.CHAT_SESSION_FORBIDDEN);
        }
        return session;
    }

    private String normalizedTitle(String title, String fallback) {
        return StringUtils.hasText(title) ? title.trim() : fallback;
    }
}
