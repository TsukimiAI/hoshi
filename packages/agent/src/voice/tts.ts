import { resolveCosyVoicePair, type VoiceSettings } from "@hoshi/shared";
import { CosyVoiceClient } from "./cosyVoice";
import { GptSovitsEngine } from "./gptSovits";

export interface TtsEngine {
  sampleRate(): number;
  start(): Promise<void>;
  speak(text: string, signal?: AbortSignal): Promise<void>;
  finish(): Promise<void>;
  cancel(): void;
}

class DashscopeTtsEngine implements TtsEngine {
  private readonly client: CosyVoiceClient;

  constructor(
    apiKey: string,
    httpBaseUrl: string,
    model: string,
    voice: string,
    onPcm: (pcm: Buffer) => void,
    onDone: () => void
  ) {
    this.client = new CosyVoiceClient(apiKey, httpBaseUrl, model, voice, onPcm, onDone);
  }

  sampleRate(): number {
    return this.client.sampleRate();
  }

  start(): Promise<void> {
    return this.client.start();
  }

  async speak(text: string, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      this.client.cancel();
      return;
    }
    const onAbort = (): void => {
      this.client.cancel();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      this.client.speak(text);
    } finally {
      signal?.removeEventListener("abort", onAbort);
    }
  }

  async finish(): Promise<void> {
    this.client.finish();
  }

  cancel(): void {
    this.client.cancel();
  }
}

export function createTtsEngine(
  voice: VoiceSettings,
  llm: { apiKey: string; baseUrl: string },
  onPcm: (pcm: Buffer) => void,
  onDone: () => void,
  onRate: (rate: number) => void
): TtsEngine {
  if (voice.ttsBackend === "gpt-sovits") {
    return new GptSovitsEngine(voice, onPcm, onDone, onRate);
  }
  if (!llm.apiKey.trim()) {
    throw new Error("请填写百炼语音 Key");
  }
  const pair = resolveCosyVoicePair(voice.ttsModel, voice.ttsVoice);
  return new DashscopeTtsEngine(
    llm.apiKey,
    llm.baseUrl,
    pair.model,
    pair.voice,
    onPcm,
    onDone
  );
}
