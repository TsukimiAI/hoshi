export interface RerankProvider {
  rerank(query: string, candidates: Array<{ id: string; text: string }>): Promise<Array<{ id: string; score: number }>>;
}

export const DEFAULT_RERANK_URL = "https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank";

export class DashScopeRerank implements RerankProvider {
  constructor(
    private readonly getConfig: () => { apiKey: string; baseUrl: string; model: string }
  ) {}

  async rerank(
    query: string,
    candidates: Array<{ id: string; text: string }>
  ): Promise<Array<{ id: string; score: number }>> {
    const config = this.getConfig();
    const response = await fetch(config.baseUrl || DEFAULT_RERANK_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.model || "gte-rerank-v2",
        input: {
          query,
          documents: candidates.map((candidate) => candidate.text)
        },
        parameters: {
          return_documents: false,
          top_n: candidates.length
        }
      }),
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Rerank request failed: ${response.status} ${text.slice(0, 200)}`);
    }
    const json = (await response.json()) as {
      output?: { results?: Array<{ index?: number; relevance_score?: number }> };
    };
    const results = Array.isArray(json.output?.results) ? json.output.results : [];
    return results
      .filter((result) => typeof result.index === "number" && candidates[result.index])
      .map((result) => ({
        id: candidates[result.index as number].id,
        score: Number(result.relevance_score ?? 0)
      }));
  }
}
