package com.tsukimiai.hoshi.conversation.application.proactive;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;

@Component
@Primary
public class LoggingProactiveConversationMetrics implements ProactiveConversationMetrics {

    private static final Logger log = LoggerFactory.getLogger(LoggingProactiveConversationMetrics.class);

    @Override
    public void recordScan(int candidateUsers) {
        log.debug("Proactive conversation scan: candidateUsers={}", candidateUsers);
    }

    @Override
    public void recordTriggered(String sourceType) {
        log.info("Proactive conversation triggered: sourceType={}", sourceType);
    }

    @Override
    public void recordSkipped(String reason) {
        log.debug("Proactive conversation skipped: reason={}", reason);
    }
}
