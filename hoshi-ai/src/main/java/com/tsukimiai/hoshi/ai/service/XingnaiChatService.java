package com.tsukimiai.hoshi.ai.service;

import java.util.List;

import com.tsukimiai.hoshi.ai.cognition.AiCognitionTask;
import com.tsukimiai.hoshi.ai.cognition.AiCognitionResult;
import com.tsukimiai.hoshi.ai.model.AiChatRequest;
import com.tsukimiai.hoshi.ai.model.AiChatTurn;

import reactor.core.publisher.Flux;

public interface XingnaiChatService {

    String complete(List<AiChatTurn> history);

    String complete(AiChatRequest request);

    Flux<String> stream(List<AiChatTurn> history);

    Flux<String> stream(List<AiChatTurn> history, boolean webSearch);

    Flux<String> stream(AiChatRequest request);

    String suggestSessionTitle(String userMessage, String assistantReply);

    String suggestEmotion(String assistantReply, List<String> allowedEmotions);

    AiCognitionResult runCognitionTask(AiCognitionTask task);
}
