package com.tsukimiai.hoshi.server.proactive;

import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.tsukimiai.hoshi.conversation.application.proactive.ProactiveConversationWorkflow;

@Component
@EnableScheduling
public class ProactiveConversationScheduler {

    private final ProactiveConversationWorkflow proactiveConversationWorkflow;

    public ProactiveConversationScheduler(ProactiveConversationWorkflow proactiveConversationWorkflow) {
        this.proactiveConversationWorkflow = proactiveConversationWorkflow;
    }

    @Scheduled(fixedDelayString = "${hoshi.proactive.scan-interval-ms:2700000}")
    public void scan() {
        proactiveConversationWorkflow.scanAllUsers();
    }
}
