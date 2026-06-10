package com.tsukimiai.hoshi.server.support;

import java.net.Socket;

import org.junit.jupiter.api.extension.ConditionEvaluationResult;
import org.junit.jupiter.api.extension.ExecutionCondition;
import org.junit.jupiter.api.extension.ExtensionContext;

public class RedisAvailable implements ExecutionCondition {

    @Override
    public ConditionEvaluationResult evaluateExecutionCondition(ExtensionContext context) {
        try (Socket socket = new Socket("localhost", 6379)) {
            return ConditionEvaluationResult.enabled("Redis is available on localhost:6379");
        } catch (Exception ex) {
            return ConditionEvaluationResult.disabled("Redis is not available on localhost:6379");
        }
    }

}
