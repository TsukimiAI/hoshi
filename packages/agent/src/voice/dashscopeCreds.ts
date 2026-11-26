import type { VoiceSettings } from "@hoshi/shared";

export function resolveDashscopeCreds(voice: VoiceSettings): { apiKey: string; baseUrl: string } {
  return {
    apiKey: voice.dashscopeApiKey.trim(),
    baseUrl: voice.dashscopeBaseUrl.trim()
  };
}

export function hasDashscopeVoiceKey(voice: VoiceSettings): boolean {
  return Boolean(voice.dashscopeApiKey.trim());
}
