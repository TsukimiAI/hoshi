package com.tsukimiai.hoshi.conversation.application.proactive;

import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.tsukimiai.hoshi.ai.service.XingnaiChatService;
import com.tsukimiai.hoshi.conversation.application.ChatContextAssembler;
import com.tsukimiai.hoshi.conversation.application.ChatMessagePersistenceService;
import com.tsukimiai.hoshi.conversation.application.CompanionEmotionPublisher;
import com.tsukimiai.hoshi.conversation.application.CompanionMessagePublisher;
import com.tsukimiai.hoshi.conversation.config.ProactiveConversationProperties;
import com.tsukimiai.hoshi.conversation.mapper.ChatSessionMapper;
import com.tsukimiai.hoshi.conversation.mapper.ProactiveConversationLogMapper;
import com.tsukimiai.hoshi.conversation.service.UserProactivePreferencesService;

@ExtendWith(MockitoExtension.class)
class ProactiveConversationWorkflowTest {

    @Mock
    private ProactiveCandidateSelector candidateSelector;
    @Mock
    private ProactivePolicyGate policyGate;
    @Mock
    private ProactiveConversationLogMapper proactiveConversationLogMapper;
    @Mock
    private ChatSessionMapper chatSessionMapper;
    @Mock
    private ChatMessagePersistenceService messagePersistenceService;
    @Mock
    private XingnaiChatService xingnaiChatService;
    @Mock
    private CompanionMessagePublisher companionMessagePublisher;
    @Mock
    private CompanionEmotionPublisher companionEmotionPublisher;
    @Mock
    private ProactiveConversationMetrics metrics;
    @Mock
    private UserProactivePreferencesService userProactivePreferencesService;
    @Mock
    private ChatContextAssembler chatContextAssembler;

    private ProactiveConversationProperties properties;
    private ProactiveConversationWorkflow workflow;

    @BeforeEach
    void setUp() {
        properties = new ProactiveConversationProperties();
        workflow = new ProactiveConversationWorkflow(
                properties,
                candidateSelector,
                policyGate,
                proactiveConversationLogMapper,
                chatSessionMapper,
                messagePersistenceService,
                xingnaiChatService,
                companionMessagePublisher,
                companionEmotionPublisher,
                metrics,
                userProactivePreferencesService,
                chatContextAssembler);
    }

    @Test
    void scanAllUsersRecordsSkippedDurationWhenDisabled() {
        when(policyGate.isEnabled()).thenReturn(false);

        workflow.scanAllUsers();

        verify(metrics).recordSkipped("disabled");
        verify(metrics).recordScanDuration(org.mockito.ArgumentMatchers.eq("skipped"), org.mockito.ArgumentMatchers.longThat(value -> value >= 0));
    }

    @Test
    void scanAllUsersRecordsUserErrorAndDuration() {
        when(policyGate.isEnabled()).thenReturn(true);
        when(candidateSelector.listCandidateUserIds(anyInt())).thenReturn(List.of(1L));
        doThrow(new RuntimeException("boom")).when(userProactivePreferencesService).getEffectiveForUserId(1L);

        workflow.scanAllUsers();

        verify(metrics).recordScan(1);
        verify(metrics).recordUserError("unexpected");
        verify(metrics).recordScanDuration(org.mockito.ArgumentMatchers.eq("success"), org.mockito.ArgumentMatchers.longThat(value -> value >= 0));
    }
}
