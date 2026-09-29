import { describe, expect, it } from "vitest";
import { DEFAULT_HOSHI_SETTINGS, type KnowledgeSettings } from "@hoshi/shared";
import type { EmbeddingProvider } from "./embedding";
import { runKbEval } from "./eval";

// 主题关键词嵌入：把文本映射到主题维度，验证检索管道端到端（分块→嵌入→混合检索）
function topicEmbedding(): EmbeddingProvider {
  return {
    modelKey: () => "fake:eval",
    async embed(texts: string[]): Promise<number[][]> {
      return texts.map((text) => {
        const v = [0, 0, 0, 0, 0];
        if (text.includes("猫") || text.includes("宠物")) v[0] = 1;
        if (text.includes("量子") || text.includes("物理")) v[1] = 1;
        if (text.includes("股票") || text.includes("投资")) v[2] = 1;
        if (text.includes("菜谱") || text.includes("烹饪")) v[3] = 1;
        if (text.includes("旅行") || text.includes("攻略")) v[4] = 1;
        return v;
      });
    }
  };
}

describe("kb eval", () => {
  it("主题区分明显时 hit@k 达到阈值", async () => {
    const result = await runKbEval({
      embedding: topicEmbedding(),
      settings: DEFAULT_HOSHI_SETTINGS.knowledge as KnowledgeSettings,
      documents: [
        { title: "养猫手册", text: "猫是一种宠物，喜欢独处，需要定期清理猫砂。" },
        { title: "量子物理入门", text: "量子物理研究微观粒子的行为，包括叠加态与纠缠。" },
        { title: "股票投资指南", text: "股票投资需要分散风险，长期持有比频繁交易更稳健。" },
        { title: "家常菜谱", text: "这道家常菜的烹饪方法是先焯水再爆炒。" }
      ],
      cases: [
        { query: "猫砂怎么清理", expectDocTitle: "养猫手册" },
        { query: "量子纠缠是什么", expectDocTitle: "量子物理入门" },
        { query: "股票怎么投资", expectDocTitle: "股票投资指南" },
        { query: "这道菜怎么做", expectDocTitle: "家常菜谱" }
      ]
    });
    expect(result.failures).toEqual([]);
    expect(result.hitAtK).toBe(1);
    expect(result.mrr).toBeGreaterThanOrEqual(0.8);
  });
});
