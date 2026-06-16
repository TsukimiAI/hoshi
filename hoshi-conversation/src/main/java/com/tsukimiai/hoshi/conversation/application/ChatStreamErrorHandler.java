package com.tsukimiai.hoshi.conversation.application;

import java.io.IOException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.tsukimiai.hoshi.common.exception.BusinessException;
import com.tsukimiai.hoshi.common.exception.ErrorCode;
import com.tsukimiai.hoshi.common.message.XingnaiMessages;
import com.tsukimiai.hoshi.conversation.stream.ChatStreamSink;

@Component
public class ChatStreamErrorHandler {

    private static final Logger log = LoggerFactory.getLogger(ChatStreamErrorHandler.class);

    public void handleStreamFailure(Long sessionId, ChatStreamSink sink, Exception ex, String action) {
        BusinessException businessException = resolveBusinessException(ex);
        if (businessException != null) {
            log.warn("{} failed for session {}: {}", action, sessionId, businessException.getMessage());
            emitFriendlyError(sink, businessException);
            return;
        }
        log.error("Unexpected {} failure for session {}", action, sessionId, ex);
        emitFriendlyError(sink, ErrorCode.INTERNAL_ERROR, XingnaiMessages.aiUnexpected());
    }

    public BusinessException resolveBusinessException(Throwable ex) {
        Throwable current = ex;
        while (current != null) {
            if (current instanceof BusinessException businessException) {
                return businessException;
            }
            current = current.getCause();
        }
        return null;
    }

    public RuntimeException unwrapStreamException(Throwable ex) {
        BusinessException businessException = resolveBusinessException(ex);
        if (businessException != null) {
            return businessException;
        }
        if (ex instanceof RuntimeException runtimeException) {
            return runtimeException;
        }
        return new IllegalStateException(ex);
    }

    private void emitFriendlyError(ChatStreamSink sink, BusinessException ex) {
        emitFriendlyError(sink, ex.getErrorCode(),
                XingnaiMessages.forErrorCode(ex.getErrorCode(), ex.getMessage()));
    }

    private void emitFriendlyError(ChatStreamSink sink, ErrorCode errorCode, String message) {
        try {
            sink.emitError(errorCode.getCode(), message);
        } catch (IOException ignored) {
            // Client disconnected while streaming.
        }
    }
}
