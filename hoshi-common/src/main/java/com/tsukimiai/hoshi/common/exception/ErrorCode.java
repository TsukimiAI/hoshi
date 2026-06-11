package com.tsukimiai.hoshi.common.exception;

public enum ErrorCode {

    BAD_REQUEST(40000, "请求参数错误"),
    UNAUTHORIZED(40100, "未登录或登录已过期"),
    FORBIDDEN(40300, "无访问权限"),
    NOT_FOUND(40400, "资源不存在"),
    CONFLICT(40900, "资源冲突"),
    INTERNAL_ERROR(50000, "系统内部错误"),

    USER_ALREADY_EXISTS(40901, "用户名或邮箱已存在"),
    INVALID_CREDENTIALS(40101, "用户名或密码错误"),
    EMAIL_NOT_VERIFIED(40301, "邮箱尚未验证，请先完成邮箱验证"),
    EMAIL_ALREADY_VERIFIED(40902, "邮箱已验证，无需重复操作"),
    INVALID_OR_EXPIRED_TOKEN(40001, "链接无效或已过期"),
    INVALID_EMAIL_CODE(40002, "验证码错误或已过期"),
    EMAIL_CODE_SEND_TOO_FREQUENT(42901, "验证码发送过于频繁，请稍后再试"),
    TOO_MANY_LOGIN_ATTEMPTS(42902, "登录尝试过于频繁，请稍后再试"),
    INVALID_REFRESH_TOKEN(40102, "登录已过期，请重新登录"),
    USER_NOT_FOUND(40401, "用户不存在"),
    CHAT_SESSION_NOT_FOUND(40402, "会话不存在"),
    CHAT_SESSION_FORBIDDEN(40302, "无权访问该会话"),
    CHAT_AI_UNAVAILABLE(50301, "AI 服务未配置或暂时不可用");

    private final int code;
    private final String message;

    ErrorCode(int code, String message) {
        this.code = code;
        this.message = message;
    }

    public int getCode() {
        return code;
    }

    public String getMessage() {
        return message;
    }

}
