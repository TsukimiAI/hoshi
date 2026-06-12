package com.tsukimiai.hoshi.common.message;

import com.tsukimiai.hoshi.common.exception.ErrorCode;

public final class XingnaiMessages {

    private XingnaiMessages() {
    }

    public static String aiUnavailable() {
        return "唔…我现在好像连不上思考回路了，稍等一会儿再找我聊聊好吗？";
    }

    public static String aiEmptyResponse() {
        return "嗯…我刚才好像走神了，能再跟我说一遍吗？";
    }

    public static String aiUnexpected() {
        return "欸，我这边出了点小状况…你可以再试一次吗？";
    }

    public static String retryUnavailable() {
        return "现在没有可以重试的消息哦，先跟我说点什么吧。";
    }

    public static String regenerateUnavailable() {
        return "还没有可以重新生成的回复呢。";
    }

    public static String messageNotFound() {
        return "这条消息好像找不到了…";
    }

    public static String forErrorCode(ErrorCode errorCode) {
        return switch (errorCode) {
            case CHAT_AI_UNAVAILABLE -> aiUnavailable();
            case CHAT_SESSION_NOT_FOUND -> "这个会话好像找不到了…要不我们开一个新的？";
            case CHAT_SESSION_FORBIDDEN -> "这个会话我暂时进不去呢。";
            case CHAT_MESSAGE_NOT_FOUND -> messageNotFound();
            case BAD_REQUEST -> "唔，这句话我好像不太明白，能换种说法吗？";
            default -> aiUnexpected();
        };
    }

    public static String forErrorCode(ErrorCode errorCode, String fallback) {
        if (fallback != null && !fallback.isBlank() && !isGenericSystemMessage(fallback)) {
            return fallback;
        }
        return forErrorCode(errorCode);
    }

    private static boolean isGenericSystemMessage(String message) {
        return message.contains("系统内部错误")
                || message.contains("模型未返回")
                || message.contains("AI 服务未配置");
    }
}
