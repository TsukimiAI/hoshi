import type { VoiceSettings } from "@hoshi/shared";

function isDashscopeUrl(url: string): boolean {
  return url.toLowerCase().includes("dashscope");
}

export function resolveDashscopeCreds(
  voice: VoiceSettings,
  fallback: { apiKey: string; baseUrl: string }
): { apiKey: string; baseUrl: string } {
  const voiceBase = voice.dashscopeBaseUrl.trim();
  const voiceKey = voice.dashscopeApiKey.trim();
  const baseUrl =
    voiceBase ||
    (isDashscopeUrl(fallback.baseUrl)
      ? fallback.baseUrl
      : "https://dashscope.aliyuncs.com/compatible-mode/v1");
  const apiKey =
    voiceKey || (isDashscopeUrl(voiceBase || fallback.baseUrl) ? fallback.apiKey.trim() : "");
  return { apiKey, baseUrl };
}

export function hasDashscopeVoiceKey(
  voice: VoiceSettings,
  fallback: { apiKey: string; baseUrl: string }
): boolean {
  return Boolean(resolveDashscopeCreds(voice, fallback).apiKey);
}
