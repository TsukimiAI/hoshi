package com.tsukimiai.hoshi.common.exception;

public class AiServiceException extends BusinessException {

    public AiServiceException(ErrorCode errorCode, String message) {
        super(errorCode, message);
    }

    public static AiServiceException unavailable() {
        return unavailable(null);
    }

    public static AiServiceException unavailable(Throwable cause) {
        AiServiceException ex = new AiServiceException(
                ErrorCode.CHAT_AI_UNAVAILABLE,
                com.tsukimiai.hoshi.common.message.XingnaiMessages.aiUnavailable());
        if (cause != null) {
            ex.initCause(cause);
        }
        return ex;
    }

    public static AiServiceException emptyResponse() {
        return new AiServiceException(
                ErrorCode.CHAT_AI_UNAVAILABLE,
                com.tsukimiai.hoshi.common.message.XingnaiMessages.aiEmptyResponse());
    }
}
