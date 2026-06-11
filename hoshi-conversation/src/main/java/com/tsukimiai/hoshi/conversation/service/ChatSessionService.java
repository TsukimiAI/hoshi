package com.tsukimiai.hoshi.conversation.service;

import java.util.List;

import com.tsukimiai.hoshi.conversation.entity.ChatSession;
import com.tsukimiai.hoshi.user.entity.User;

public interface ChatSessionService {

    List<ChatSession> listByUser(User user);

    ChatSession create(User user, String title);

    ChatSession get(User user, Long sessionId);

    ChatSession updateTitle(User user, Long sessionId, String title);

    void delete(User user, Long sessionId);
}
