package com.tsukimiai.hoshi.conversation.application.proactive;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.tsukimiai.hoshi.ai.cognition.AiCognitionInput;
import com.tsukimiai.hoshi.ai.cognition.AiCognitionResult;
import com.tsukimiai.hoshi.ai.cognition.AiCognitionTask;
import com.tsukimiai.hoshi.ai.cognition.AiCognitionTaskType;
import com.tsukimiai.hoshi.ai.cognition.ProactiveOpeningResult;
import com.tsukimiai.hoshi.ai.service.XingnaiChatService;
import com.tsukimiai.hoshi.common.companion.CompanionEmotion;
import com.tsukimiai.hoshi.common.companion.CompanionEventSource;
import com.tsukimiai.hoshi.conversation.application.ChatContextAssembler;
import com.tsukimiai.hoshi.conversation.application.ChatMessagePersistenceService;
import com.tsukimiai.hoshi.conversation.application.CompanionEmotionPublisher;
import com.tsukimiai.hoshi.conversation.application.CompanionMessagePublisher;
import com.tsukimiai.hoshi.conversation.config.ProactiveConversationProperties;
import com.tsukimiai.hoshi.conversation.entity.ChatMessage;
import com.tsukimiai.hoshi.conversation.entity.ChatMessageSource;
import com.tsukimiai.hoshi.conversation.entity.ChatSession;
import com.tsukimiai.hoshi.conversation.entity.ProactiveConversationLog;
import com.tsukimiai.hoshi.conversation.entity.ProactiveSourceType;
import com.tsukimiai.hoshi.conversation.dto.UserProactivePreferencesResponse;
import com.tsukimiai.hoshi.conversation.mapper.ChatSessionMapper;
import com.tsukimiai.hoshi.conversation.mapper.ProactiveConversationLogMapper;
import com.tsukimiai.hoshi.conversation.service.UserProactivePreferencesService;

@Service
public class ProactiveConversationWorkflow {

    private static final Logger log = LoggerFactory.getLogger(ProactiveConversationWorkflow.class);

    private final ProactiveConversationProperties properties;
    private final ProactiveCandidateSelector candidateSelector;
    private final ProactivePolicyGate policyGate;
    private final ProactiveConversationLogMapper proactiveConversationLogMapper;
    private final ChatSessionMapper chatSessionMapper;
    private final ChatMessagePersistenceService messagePersistenceService;
    private final XingnaiChatService xingnaiChatService;
    private final CompanionMessagePublisher companionMessagePublisher;
    private final CompanionEmotionPublisher companionEmotionPublisher;
    private final ProactiveConversationMetrics metrics;
    private final UserProactivePreferencesService userProactivePreferencesService;
    private final ChatContextAssembler chatContextAssembler;

    public ProactiveConversationWorkflow(
            ProactiveConversationProperties properties,
            ProactiveCandidateSelector candidateSelector,
            ProactivePolicyGate policyGate,
            ProactiveConversationLogMapper proactiveConversationLogMapper,
            ChatSessionMapper chatSessionMapper,
            ChatMessagePersistenceService messagePersistenceService,
            XingnaiChatService xingnaiChatService,
            CompanionMessagePublisher companionMessagePublisher,
            CompanionEmotionPublisher companionEmotionPublisher,
            ProactiveConversationMetrics metrics,
            UserProactivePreferencesService userProactivePreferencesService,
            ChatContextAssembler chatContextAssembler) {
        this.properties = properties;
        this.candidateSelector = candidateSelector;
        this.policyGate = policyGate;
        this.proactiveConversationLogMapper = proactiveConversationLogMapper;
        this.chatSessionMapper = chatSessionMapper;
        this.messagePersistenceService = messagePersistenceService;
        this.xingnaiChatService = xingnaiChatService;
        this.companionMessagePublisher = companionMessagePublisher;
        this.companionEmotionPublisher = companionEmotionPublisher;
        this.metrics = metrics;
        this.userProactivePreferencesService = userProactivePreferencesService;
        this.chatContextAssembler = chatContextAssembler;
    }

    public void scanAllUsers() {
        long startTime = System.nanoTime();
        if (!policyGate.isEnabled()) {
            metrics.recordSkipped("disabled");
            metrics.recordScanDuration("skipped", System.nanoTime() - startTime);
            return;
        }

        List<Long> userIds = candidateSelector.listCandidateUserIds(properties.getMaxUsersPerScan());
        metrics.recordScan(userIds.size());
        for (Long userId : userIds) {
            try {
                tryTriggerForUser(userId);
            } catch (Exception ex) {
                metrics.recordUserError("unexpected");
                log.warn("Proactive conversation failed for user {}: {}", userId, ex.getMessage(), ex);
            }
        }
        metrics.recordScanDuration("success", System.nanoTime() - startTime);
    }

    @Transactional
    public boolean tryTriggerForUser(Long userId) {
        UserProactivePreferencesResponse userPreferences = userProactivePreferencesService.getEffectiveForUserId(userId);
        if (!userPreferences.enabled()) {
            metrics.recordSkipped("user_disabled");
            return false;
        }

        List<ProactiveCandidate> candidates = candidateSelector.selectCandidates(userId);
        if (candidates.isEmpty()) {
            metrics.recordSkipped("no_candidates");
            return false;
        }

        ProactivePolicyContext policyContext = buildPolicyContext(userId, candidates.get(0).sessionId(), userPreferences);
        String globalBlock = policyGate.getGlobalBlockReason(policyContext).orElse(null);
        if (globalBlock != null) {
            metrics.recordSkipped(globalBlock);
            return false;
        }

        ProactiveCandidate selected = policyGate.pickCandidate(candidates, policyContext);
        if (selected == null) {
            metrics.recordSkipped("policy_blocked");
            return false;
        }

        ProactiveOpeningResult opening = generateOpening(selected);
        if (opening == null || !StringUtils.hasText(opening.content())) {
            metrics.recordSkipped("empty_opening");
            return false;
        }

        String openingContent = opening.content().trim();
        CompanionEmotion openingEmotion = ProactiveEmotionResolver.resolveOpening(
                opening.emotion(),
                selected.sourceType(),
                selected.memoryCategory());

        ChatMessageSource messageSource = selected.sourceType() == ProactiveSourceType.OPEN_LOOP
                ? ChatMessageSource.PROACTIVE_OPEN_LOOP
                : ChatMessageSource.PROACTIVE_MEMORY;

        ChatMessage message = messagePersistenceService.insertProactiveAssistantMessage(
                selected.sessionId(),
                openingContent,
                openingEmotion.getValue(),
                messageSource);

        ChatSession session = chatSessionMapper.selectById(selected.sessionId());
        if (session != null) {
            messagePersistenceService.touchSession(session);
        }

        ProactiveConversationLog logEntry = new ProactiveConversationLog();
        logEntry.setUserId(userId);
        logEntry.setSessionId(selected.sessionId());
        logEntry.setSourceType(selected.sourceType().getValue());
        logEntry.setSourceKey(selected.sourceKey());
        logEntry.setMessageId(message.getId());
        logEntry.setContent(openingContent);
        logEntry.setResponded(false);
        logEntry.setCreatedAt(LocalDateTime.now());
        proactiveConversationLogMapper.insert(logEntry);

        companionMessagePublisher.publish(
                selected.sessionId(),
                message.getId(),
                message.getContent(),
                openingEmotion.getValue());
        companionEmotionPublisher.publish(openingEmotion, CompanionEventSource.SYSTEM, message.getId(), null);

        metrics.recordTriggered(selected.sourceType().getValue());
        return true;
    }

    private ProactiveOpeningResult generateOpening(ProactiveCandidate candidate) {
        ChatSession session = chatSessionMapper.selectById(candidate.sessionId());
        if (session == null) {
            return null;
        }
        List<ChatMessage> messages = messagePersistenceService.listRecentMessages(session.getId(), Integer.MAX_VALUE);
        Map<String, Object> anchor = Map.of(
                "sourceType", candidate.sourceType().getValue(),
                "hint", candidate.hint(),
                "memoryCategory", candidate.memoryCategory() == null ? "" : candidate.memoryCategory());
        AiCognitionInput input = chatContextAssembler.buildProactiveCognitionContext(
                candidate.userId(),
                session,
                messages,
                candidate.hint(),
                anchor);
        AiCognitionTask task = new AiCognitionTask(
                null,
                AiCognitionTaskType.PROACTIVE_OPENING,
                candidate.userId(),
                candidate.sessionId(),
                candidate.sourceKey(),
                input);
        AiCognitionResult result = xingnaiChatService.runCognitionTask(task);
        if (result.result() instanceof ProactiveOpeningResult payload) {
            return payload;
        }
        return null;
    }

    private ProactivePolicyContext buildPolicyContext(
            Long userId,
            Long sessionId,
            UserProactivePreferencesResponse userPreferences) {
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime lastUserMessageAt = candidateSelector.findLastUserMessageAt(sessionId);

        List<ProactiveConversationLog> recentLogs = proactiveConversationLogMapper.selectList(
                new LambdaQueryWrapper<ProactiveConversationLog>()
                        .eq(ProactiveConversationLog::getUserId, userId)
                        .orderByDesc(ProactiveConversationLog::getCreatedAt)
                        .last("LIMIT 20"));

        LocalDateTime lastProactiveAt = recentLogs.stream()
                .map(ProactiveConversationLog::getCreatedAt)
                .findFirst()
                .orElse(null);

        int todayCount = (int) recentLogs.stream()
                .filter(log -> log.getCreatedAt() != null && !log.getCreatedAt().isBefore(policyGate.startOfToday()))
                .count();

        LocalDateTime sourceCooldownSince = now.minusHours(properties.getSourceCooldownHours());
        List<String> recentSourceKeys = recentLogs.stream()
                .filter(log -> log.getCreatedAt() != null && log.getCreatedAt().isAfter(sourceCooldownSince))
                .map(ProactiveConversationLog::getSourceKey)
                .toList();

        return new ProactivePolicyContext(
                now,
                lastUserMessageAt,
                lastProactiveAt,
                todayCount,
                recentSourceKeys,
                userPreferences.enabled());
    }
}
