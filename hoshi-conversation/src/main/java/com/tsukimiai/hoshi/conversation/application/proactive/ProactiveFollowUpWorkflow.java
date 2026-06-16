package com.tsukimiai.hoshi.conversation.application.proactive;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.tsukimiai.hoshi.ai.cognition.AiCognitionInput;
import com.tsukimiai.hoshi.ai.cognition.AiCognitionResult;
import com.tsukimiai.hoshi.ai.cognition.AiCognitionTask;
import com.tsukimiai.hoshi.ai.cognition.AiCognitionTaskType;
import com.tsukimiai.hoshi.ai.cognition.ProactiveFollowUpContentResult;
import com.tsukimiai.hoshi.ai.cognition.ProactiveFollowUpJudgmentResult;
import com.tsukimiai.hoshi.ai.service.XingnaiChatService;
import com.tsukimiai.hoshi.conversation.application.ChatContextAssembler;
import com.tsukimiai.hoshi.conversation.application.ChatMessagePersistenceService;
import com.tsukimiai.hoshi.conversation.config.ProactiveConversationProperties;
import com.tsukimiai.hoshi.conversation.dto.UserProactivePreferencesResponse;
import com.tsukimiai.hoshi.conversation.entity.ChatMessage;
import com.tsukimiai.hoshi.conversation.entity.ChatMessageSource;
import com.tsukimiai.hoshi.conversation.entity.ChatSession;
import com.tsukimiai.hoshi.conversation.entity.ProactiveConversationLog;
import com.tsukimiai.hoshi.conversation.entity.ProactiveFollowUpLog;
import com.tsukimiai.hoshi.conversation.mapper.ProactiveFollowUpLogMapper;
import com.tsukimiai.hoshi.conversation.service.ChatSessionService;
import com.tsukimiai.hoshi.conversation.service.UserProactivePreferencesService;
import com.tsukimiai.hoshi.conversation.support.StreamPlaybackContext;
import com.tsukimiai.hoshi.user.entity.User;

@Service
public class ProactiveFollowUpWorkflow {

    private static final Logger log = LoggerFactory.getLogger(ProactiveFollowUpWorkflow.class);

    private final ProactiveConversationProperties properties;
    private final ProactiveReplyTracker replyTracker;
    private final ChatMessagePersistenceService persistenceService;
    private final ChatSessionService chatSessionService;
    private final ChatContextAssembler chatContextAssembler;
    private final XingnaiChatService xingnaiChatService;
    private final UserProactivePreferencesService userProactivePreferencesService;
    private final ProactiveFollowUpLogMapper proactiveFollowUpLogMapper;

    public ProactiveFollowUpWorkflow(
            ProactiveConversationProperties properties,
            ProactiveReplyTracker replyTracker,
            ChatMessagePersistenceService persistenceService,
            ChatSessionService chatSessionService,
            ChatContextAssembler chatContextAssembler,
            XingnaiChatService xingnaiChatService,
            UserProactivePreferencesService userProactivePreferencesService,
            ProactiveFollowUpLogMapper proactiveFollowUpLogMapper) {
        this.properties = properties;
        this.replyTracker = replyTracker;
        this.persistenceService = persistenceService;
        this.chatSessionService = chatSessionService;
        this.chatContextAssembler = chatContextAssembler;
        this.xingnaiChatService = xingnaiChatService;
        this.userProactivePreferencesService = userProactivePreferencesService;
        this.proactiveFollowUpLogMapper = proactiveFollowUpLogMapper;
    }

    /**
     * 用户发起对话、星奈完成首轮回复后，若用户开启了追加对话即可进入判断流程。
     * 不依赖主动对话是否开启，也不要求存在主动对话线程。
     */
    public boolean canRunFollowUp(User user, Long sessionId) {
        if (!properties.getFollowUp().isEnabled()) {
            return false;
        }
        UserProactivePreferencesResponse preferences = userProactivePreferencesService.getEffectiveForUserId(user.getId());
        return preferences.followUpEnabled();
    }

    @Transactional
    public FollowUpLoopResult runFollowUpLoop(
            User user,
            Long sessionId,
            FollowUpRoundStreamer streamer,
            StreamPlaybackContext playback) {
        Optional<ProactiveConversationLog> proactiveLog = replyTracker.findOpenLog(sessionId);
        int maxRounds = properties.getFollowUp().getMaxRoundsPerSse();
        int completedRounds = 0;
        String endReason = "model_stopped";

        for (int round = 1; round <= maxRounds; round++) {
            List<ChatMessage> messages = persistenceService.listRecentMessages(sessionId, Integer.MAX_VALUE);
            ChatSession session = chatSessionService.get(user, sessionId);
            Map<String, Object> anchor = new HashMap<>();
            anchor.put("trigger", "after_user_message_reply");
            proactiveLog.ifPresent(log -> {
                anchor.put("proactiveLogId", log.getId());
                anchor.put("sourceType", log.getSourceType());
                anchor.put("sourceKey", log.getSourceKey());
            });
            AiCognitionInput cognitionInput = chatContextAssembler.buildProactiveCognitionContext(
                    user.getId(),
                    session,
                    messages,
                    chatContextAssembler.findLatestUserMessage(
                            chatContextAssembler.buildChatContext(user.getId(), session, messages).recentTurns()),
                    anchor);

            ProactiveFollowUpJudgmentResult judgment = runJudgment(user, sessionId, proactiveLog.orElse(null), cognitionInput);
            if (judgment == null || !shouldContinue(judgment, round)) {
                endReason = judgment == null ? "judgment_failed" : judgment.reason();
                endProactiveLogIfPresent(proactiveLog, endReason);
                break;
            }

            String mode = normalizeMode(judgment.mode());
            ProactiveFollowUpContentResult contentResult = runContentGeneration(user, sessionId, cognitionInput, mode);
            if (contentResult == null || !StringUtils.hasText(contentResult.content())) {
                endReason = "empty_content";
                endProactiveLogIfPresent(proactiveLog, endReason);
                break;
            }

            ChatMessageSource source = "new_topic".equals(mode)
                    ? ChatMessageSource.FOLLOW_UP_NEW_TOPIC
                    : ChatMessageSource.FOLLOW_UP_CONTINUE;
            try {
                ChatMessage saved = streamer.streamRound(round, mode, contentResult, source, playback);
                persistFollowUpLog(proactiveLog.map(ProactiveConversationLog::getId).orElse(null), sessionId, saved.getId(), mode, judgment.reason());
                completedRounds++;
            } catch (IOException ex) {
                endReason = "client_closed";
                break;
            }
        }

        if (completedRounds >= maxRounds) {
            endReason = "max_rounds";
            endProactiveLogIfPresent(proactiveLog, endReason);
        }
        return new FollowUpLoopResult(completedRounds, endReason);
    }

    private void endProactiveLogIfPresent(Optional<ProactiveConversationLog> proactiveLog, String reason) {
        proactiveLog.ifPresent(log -> replyTracker.markEnded(log.getId(), reason));
    }

    private ProactiveFollowUpJudgmentResult runJudgment(
            User user,
            Long sessionId,
            ProactiveConversationLog proactiveLog,
            AiCognitionInput cognitionInput) {
        String triggerKey = proactiveLog != null ? proactiveLog.getSourceKey() : "user_chat";
        AiCognitionTask task = new AiCognitionTask(
                null,
                AiCognitionTaskType.PROACTIVE_FOLLOW_UP_JUDGMENT,
                user.getId(),
                sessionId,
                triggerKey,
                cognitionInput);
        AiCognitionResult result = xingnaiChatService.runCognitionTask(task);
        if (result.result() instanceof ProactiveFollowUpJudgmentResult judgment) {
            return judgment;
        }
        return null;
    }

    private ProactiveFollowUpContentResult runContentGeneration(
            User user,
            Long sessionId,
            AiCognitionInput cognitionInput,
            String mode) {
        Map<String, Object> metadata = new HashMap<>(cognitionInput.metadata());
        metadata.put("mode", mode);
        AiCognitionInput input = new AiCognitionInput(
                cognitionInput.recentTurns(),
                cognitionInput.sessionSummary(),
                metadata);
        AiCognitionTask task = new AiCognitionTask(
                null,
                AiCognitionTaskType.PROACTIVE_FOLLOW_UP_CONTENT,
                user.getId(),
                sessionId,
                mode,
                input);
        AiCognitionResult result = xingnaiChatService.runCognitionTask(task);
        if (result.result() instanceof ProactiveFollowUpContentResult content) {
            return content;
        }
        return null;
    }

    private boolean shouldContinue(ProactiveFollowUpJudgmentResult judgment, int round) {
        if (judgment.naturalEnd()) {
            return false;
        }
        if (!judgment.shouldContinue()) {
            return false;
        }
        double threshold = round == 1
                ? properties.getFollowUp().getFirstRoundJudgmentMinConfidence()
                : properties.getFollowUp().getJudgmentMinConfidence();
        return judgment.confidence() >= threshold;
    }

    private String normalizeMode(String mode) {
        if ("new_topic".equalsIgnoreCase(mode)) {
            return "new_topic";
        }
        return "continue";
    }

    private void persistFollowUpLog(
            Long proactiveLogId,
            Long sessionId,
            Long messageId,
            String mode,
            String reason) {
        ProactiveFollowUpLog entry = new ProactiveFollowUpLog();
        entry.setProactiveLogId(proactiveLogId);
        entry.setSessionId(sessionId);
        entry.setMessageId(messageId);
        entry.setMode(mode);
        entry.setJudgmentReason(reason);
        entry.setCreatedAt(LocalDateTime.now());
        proactiveFollowUpLogMapper.insert(entry);
    }

    public record FollowUpLoopResult(int totalRounds, String endReason) {
    }

    @FunctionalInterface
    public interface FollowUpRoundStreamer {
        ChatMessage streamRound(
                int round,
                String mode,
                ProactiveFollowUpContentResult content,
                ChatMessageSource source,
                StreamPlaybackContext playback) throws IOException;
    }
}
