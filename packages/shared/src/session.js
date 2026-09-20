"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.USAGE_PURPOSES = exports.SESSION_TITLE_MAX_LEN = exports.DEFAULT_SESSION_TITLE = void 0;
exports.sessionTitleFromUserMessage = sessionTitleFromUserMessage;
exports.DEFAULT_SESSION_TITLE = "新会话";
exports.SESSION_TITLE_MAX_LEN = 48;
function sessionTitleFromUserMessage(message) {
    return message.replace(/\s+/g, " ").trim().slice(0, exports.SESSION_TITLE_MAX_LEN);
}
exports.USAGE_PURPOSES = ["chat", "tool", "compact", "extract", "asr"];
