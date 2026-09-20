export interface ModelSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface ChatSettings {
  contextBudget: number;
  compactTriggerToken: number;
  compactTriggerMsgCount: number;
  compactKeepRecent: number;
  referenceSites: string;
  memoryAutoWrite: boolean;
}

export interface PresentationSettings {
  typeCharMs: number;
  sentenceGapMs: number;
  maxAssistantBubbles: number;
  fadeDelayMs: number;
  panelIdleCloseMs: number;
}

export interface PluginSettings {
  enabled: string[];
  configs: Record<string, Record<string, string>>;
}

export type TtsBackend = "dashscope" | "gpt-sovits";
export type AsrBackend = "dashscope" | "whisper";

export interface VoiceSettings {
  ttsBackend: TtsBackend;
  asrBackend: AsrBackend;
  dashscopeApiKey: string;
  dashscopeBaseUrl: string;
  hotwords: string;
  hotwordVocabularyId: string;
  ttsModel: string;
  ttsVoice: string;
  gsvBaseUrl: string;
  gsvRefAudioPath: string;
  gsvPromptText: string;
  gsvPromptLang: string;
  gsvGptWeights: string;
  gsvSovitsWeights: string;
  whisperBin: string;
  whisperModelPath: string;
  ttsEnabled: boolean;
}

export interface HoshiSettings {
  model: ModelSettings;
  chat: ChatSettings;
  presentation: PresentationSettings;
  plugins: PluginSettings;
  voice: VoiceSettings;
}

export interface SettingsEnvSeed {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export const DEFAULT_HOSHI_SETTINGS: HoshiSettings = {
  model: {
    apiKey: "",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini"
  },
  chat: {
    contextBudget: 8000,
    compactTriggerToken: 6000,
    compactTriggerMsgCount: 80,
    compactKeepRecent: 24,
    referenceSites: "",
    memoryAutoWrite: true
  },
  presentation: {
    typeCharMs: 38,
    sentenceGapMs: 220,
    maxAssistantBubbles: 3,
    fadeDelayMs: 4000,
    panelIdleCloseMs: 12000
  },
  plugins: {
    enabled: [],
    configs: {}
  },
  voice: {
    ttsBackend: "dashscope",
    asrBackend: "dashscope",
    dashscopeApiKey: "",
    dashscopeBaseUrl: "",
    hotwords: "星奈,老师",
    hotwordVocabularyId: "",
    ttsModel: "cosyvoice-v2",
    ttsVoice: "longxiaochun_v2",
    gsvBaseUrl: "http://127.0.0.1:9880",
    gsvRefAudioPath: "",
    gsvPromptText: "",
    gsvPromptLang: "zh",
    gsvGptWeights: "",
    gsvSovitsWeights: "",
    whisperBin: "",
    whisperModelPath: "",
    ttsEnabled: true
  }
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (value === "true" || value === 1) {
    return true;
  }
  if (value === "false" || value === 0) {
    return false;
  }
  return fallback;
}

function readPositiveInt(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return fallback;
  }
  return Math.floor(n);
}

export function resolveCosyVoicePair(
  model: string,
  voice: string
): { model: string; voice: string } {
  let nextModel = model.trim();
  let nextVoice = voice.trim();
  const looksVoice = (value: string): boolean =>
    /^(long|loong)/i.test(value) && !value.includes("cosyvoice");
  if (looksVoice(nextModel) && !looksVoice(nextVoice)) {
    nextVoice = nextModel;
    nextModel = "cosyvoice-v2";
  }
  if (!nextModel || nextModel.includes("v3")) {
    nextModel = "cosyvoice-v2";
    if (!nextVoice || nextVoice === "longxiaochun" || nextVoice.endsWith("_v3")) {
      nextVoice = nextVoice.endsWith("_v3")
        ? nextVoice.replace(/_v3$/, "_v2")
        : "longxiaochun_v2";
    }
  }
  if (!nextVoice) {
    nextVoice = "longxiaochun_v2";
  }
  if (nextModel.includes("v2") && (nextVoice === "longxiaochun" || nextVoice.endsWith("_v3"))) {
    nextVoice = nextVoice === "longxiaochun" ? "longxiaochun_v2" : nextVoice.replace(/_v3$/, "_v2");
  }
  return { model: nextModel, voice: nextVoice };
}

export function resolveHoshiSettings(stored: unknown, env: SettingsEnvSeed = {}): HoshiSettings {
  const seeded: HoshiSettings = {
    model: {
      apiKey: env.apiKey?.trim() || DEFAULT_HOSHI_SETTINGS.model.apiKey,
      baseUrl: env.baseUrl?.trim() || DEFAULT_HOSHI_SETTINGS.model.baseUrl,
      model: env.model?.trim() || DEFAULT_HOSHI_SETTINGS.model.model
    },
    chat: { ...DEFAULT_HOSHI_SETTINGS.chat },
    presentation: { ...DEFAULT_HOSHI_SETTINGS.presentation },
    plugins: {
      enabled: [],
      configs: mergePluginConfigs({})
    },
    voice: { ...DEFAULT_HOSHI_SETTINGS.voice }
  };

  if (!isRecord(stored)) {
    return seeded;
  }

  const model = isRecord(stored.model) ? stored.model : {};
  const chat = isRecord(stored.chat) ? stored.chat : {};
  const presentation = isRecord(stored.presentation) ? stored.presentation : {};
  const plugins = isRecord(stored.plugins) ? stored.plugins : {};
  const voice = isRecord(stored.voice) ? stored.voice : {};

  const ttsBackendRaw = readString(voice.ttsBackend, seeded.voice.ttsBackend);
  const ttsBackend: TtsBackend = ttsBackendRaw === "gpt-sovits" ? "gpt-sovits" : "dashscope";
  const asrBackendRaw = readString(voice.asrBackend, seeded.voice.asrBackend);
  const asrBackend: AsrBackend = asrBackendRaw === "whisper" ? "whisper" : "dashscope";

  return {
    model: {
      apiKey: readString(model.apiKey, seeded.model.apiKey).trim() || seeded.model.apiKey,
      baseUrl: readString(model.baseUrl, seeded.model.baseUrl).trim() || seeded.model.baseUrl,
      model: readString(model.model, seeded.model.model).trim() || seeded.model.model
    },
    chat: {
      contextBudget: readPositiveInt(chat.contextBudget, seeded.chat.contextBudget),
      compactTriggerToken: readPositiveInt(
        chat.compactTriggerToken,
        seeded.chat.compactTriggerToken
      ),
      compactTriggerMsgCount: readPositiveInt(
        chat.compactTriggerMsgCount,
        seeded.chat.compactTriggerMsgCount
      ),
      compactKeepRecent: readPositiveInt(chat.compactKeepRecent, seeded.chat.compactKeepRecent),
      referenceSites: readString(chat.referenceSites, seeded.chat.referenceSites),
      memoryAutoWrite: readBoolean(chat.memoryAutoWrite, seeded.chat.memoryAutoWrite)
    },
    presentation: {
      typeCharMs: readPositiveInt(presentation.typeCharMs, seeded.presentation.typeCharMs),
      sentenceGapMs: readPositiveInt(presentation.sentenceGapMs, seeded.presentation.sentenceGapMs),
      maxAssistantBubbles: readPositiveInt(
        presentation.maxAssistantBubbles,
        seeded.presentation.maxAssistantBubbles
      ),
      fadeDelayMs: readPositiveInt(presentation.fadeDelayMs, seeded.presentation.fadeDelayMs),
      panelIdleCloseMs: readPositiveInt(
        presentation.panelIdleCloseMs,
        seeded.presentation.panelIdleCloseMs
      )
    },
    plugins: {
      enabled: readEnabled(plugins.enabled),
      configs: mergePluginConfigs(plugins.configs)
    },
    voice: {
      ttsBackend,
      asrBackend,
      dashscopeApiKey: readString(voice.dashscopeApiKey, seeded.voice.dashscopeApiKey),
      dashscopeBaseUrl: readString(voice.dashscopeBaseUrl, seeded.voice.dashscopeBaseUrl).trim(),
      hotwords: readString(voice.hotwords, seeded.voice.hotwords),
      hotwordVocabularyId: readString(voice.hotwordVocabularyId, seeded.voice.hotwordVocabularyId).trim(),
      ...(() => {
        const pair = resolveCosyVoicePair(
          readString(voice.ttsModel, seeded.voice.ttsModel).trim() || seeded.voice.ttsModel,
          readString(voice.ttsVoice, seeded.voice.ttsVoice).trim() || seeded.voice.ttsVoice
        );
        return { ttsModel: pair.model, ttsVoice: pair.voice };
      })(),
      gsvBaseUrl: readString(voice.gsvBaseUrl, seeded.voice.gsvBaseUrl).trim() || seeded.voice.gsvBaseUrl,
      gsvRefAudioPath: readString(voice.gsvRefAudioPath, seeded.voice.gsvRefAudioPath),
      gsvPromptText: readString(voice.gsvPromptText, seeded.voice.gsvPromptText),
      gsvPromptLang: readString(voice.gsvPromptLang, seeded.voice.gsvPromptLang).trim() || "zh",
      gsvGptWeights: readString(voice.gsvGptWeights, seeded.voice.gsvGptWeights),
      gsvSovitsWeights: readString(voice.gsvSovitsWeights, seeded.voice.gsvSovitsWeights),
      whisperBin: readString(voice.whisperBin, seeded.voice.whisperBin).trim(),
      whisperModelPath: readString(voice.whisperModelPath, seeded.voice.whisperModelPath).trim(),
      ttsEnabled: readBoolean(voice.ttsEnabled, seeded.voice.ttsEnabled)
    }
  };
}

function readEnabled(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const ids: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }
    const id = item.trim();
    if (id && !ids.includes(id)) {
      ids.push(id);
    }
  }
  return ids;
}

function readStringMap(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") {
      result[key] = entry;
    }
  }
  return result;
}

function mergePluginConfigs(value: unknown): Record<string, Record<string, string>> {
  const configs: Record<string, Record<string, string>> = {};
  if (isRecord(value)) {
    for (const [id, entry] of Object.entries(value)) {
      if (id === "web_search") {
        continue;
      }
      configs[id] = readStringMap(entry);
    }
  }
  return configs;
}
