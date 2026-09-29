import type { OpenAiCompatClient } from "../llm/openai";

// DashScope text-embedding-v4 单次请求上限为 10 条文本
export const EMBED_BATCH_SIZE = 10;

export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
  modelKey(): string;
}

export interface EmbeddingConfig {
  model: string;
  apiKey: string;
  baseUrl: string;
}

export class OpenAiCompatEmbedding implements EmbeddingProvider {
  constructor(
    private readonly llm: OpenAiCompatClient,
    private readonly getConfig: () => EmbeddingConfig
  ) {}

  modelKey(): string {
    return `openai-compat:${this.getConfig().model}`;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const config = this.getConfig();
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
      const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
      const vectors = await this.llm.embed(batch, {
        model: config.model,
        // 留空则回退到聊天模型凭据/端点（兼容旧行为）
        apiKey: config.apiKey || undefined,
        baseUrl: config.baseUrl || undefined,
        timeoutMs: 30000
      });
      out.push(...vectors);
    }
    return out;
  }
}
