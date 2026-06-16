package com.tsukimiai.hoshi.ai.cognition;

import java.util.UUID;

public record AiCognitionTask(
        String taskId,
        AiCognitionTaskType taskType,
        Long sessionId,
        Long userId,
        String trigger,
        AiCognitionInput input) {

    public AiCognitionTask {
        if (taskId == null || taskId.isBlank()) {
            taskId = UUID.randomUUID().toString();
        }
    }
}
