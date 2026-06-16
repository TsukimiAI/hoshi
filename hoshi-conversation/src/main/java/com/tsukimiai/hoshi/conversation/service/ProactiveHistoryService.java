package com.tsukimiai.hoshi.conversation.service;

import java.util.List;

import com.tsukimiai.hoshi.conversation.dto.ProactiveHistoryResponse;
import com.tsukimiai.hoshi.user.entity.User;

public interface ProactiveHistoryService {

    List<ProactiveHistoryResponse> listRecent(User user, int limit, int offset);
}
