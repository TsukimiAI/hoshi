package com.tsukimiai.hoshi.conversation.service;

import java.time.LocalDateTime;
import java.util.List;

import com.tsukimiai.hoshi.conversation.dto.CreateUserMemoryRequest;
import com.tsukimiai.hoshi.conversation.dto.MemoryCorrectionResponse;
import com.tsukimiai.hoshi.conversation.dto.RecentMemoryResponse;
import com.tsukimiai.hoshi.conversation.dto.UpdateUserMemoryRequest;
import com.tsukimiai.hoshi.conversation.dto.UserMemoryResponse;
import com.tsukimiai.hoshi.user.entity.User;

public interface UserMemoryService {

    List<UserMemoryResponse> listMemories(User user, String category);

    List<RecentMemoryResponse> listRecentLongTermEvents(User user, LocalDateTime since);

    List<MemoryCorrectionResponse> listRecentCorrections(User user, int limit, int offset);

    UserMemoryResponse createLongTermMemory(User user, CreateUserMemoryRequest request);

    UserMemoryResponse updateLongTermMemory(User user, Long memoryId, UpdateUserMemoryRequest request);

    void archiveMemory(User user, Long memoryId);
}
