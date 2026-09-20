"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveDashscopeCreds = resolveDashscopeCreds;
exports.hasDashscopeVoiceKey = hasDashscopeVoiceKey;
function isDashscopeUrl(url) {
    return url.toLowerCase().includes("dashscope");
}
function resolveDashscopeCreds(voice, fallback) {
    const voiceBase = voice.dashscopeBaseUrl.trim();
    const voiceKey = voice.dashscopeApiKey.trim();
    const baseUrl = voiceBase ||
        (isDashscopeUrl(fallback.baseUrl)
            ? fallback.baseUrl
            : "https://dashscope.aliyuncs.com/compatible-mode/v1");
    const apiKey = voiceKey || (isDashscopeUrl(voiceBase || fallback.baseUrl) ? fallback.apiKey.trim() : "");
    return { apiKey, baseUrl };
}
function hasDashscopeVoiceKey(voice, fallback) {
    return Boolean(resolveDashscopeCreds(voice, fallback).apiKey);
}
