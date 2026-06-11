package com.tsukimiai.hoshi.conversation.web;

import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import com.tsukimiai.hoshi.common.message.XingnaiMessages;
import com.tsukimiai.hoshi.common.api.ApiResponse;
import com.tsukimiai.hoshi.common.exception.BusinessException;
import com.tsukimiai.hoshi.common.exception.ErrorCode;

@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(basePackages = "com.tsukimiai.hoshi.conversation.web")
public class ConversationExceptionHandler {

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ApiResponse<Void>> handleBusinessException(BusinessException ex) {
        ErrorCode errorCode = ex.getErrorCode();
        String message = XingnaiMessages.forErrorCode(errorCode,
                ex.getMessage() != null ? ex.getMessage() : errorCode.getMessage());
        HttpStatus status = switch (errorCode) {
            case CHAT_SESSION_FORBIDDEN -> HttpStatus.FORBIDDEN;
            case CHAT_SESSION_NOT_FOUND -> HttpStatus.NOT_FOUND;
            case CHAT_AI_UNAVAILABLE -> HttpStatus.SERVICE_UNAVAILABLE;
            default -> HttpStatus.BAD_REQUEST;
        };
        return ResponseEntity.status(status).body(ApiResponse.fail(errorCode.getCode(), message));
    }
}
