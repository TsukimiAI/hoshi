import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import type { KnowledgeSettings } from "@hoshi/shared";
import { DEFAULT_HOSHI_SETTINGS } from "@hoshi/shared";
import { migrateDb } from "../storage/db";
import type { EmbeddingProvider } from "./embedding";
import { KnowledgeService } from "./service";
import { runRagasEval } from "./ragas";

function keywordEmbedding(): EmbeddingProvider {
  return {
    modelKey: () => "fake:ragas",
    async embed(texts: string[]): Promise<number[][]> {
      return texts.map((text) => (text.includes("猫") ? [1, 0, 0, 0] : [0, 0, 0, 0]));
    }
  };
}

describe("runRagasEval", () => {
  it("计算 faithfulness / context relevance / answer relevance", async () => {
    const db = new DatabaseSync(":memory:", { allowExtension: true });
    migrateDb(db);
    const service = new KnowledgeService(db, keywordEmbedding(), DEFAULT_HOSHI_SETTINGS.knowledge as KnowledgeSettings);
    const collection = await service.createCollection("库");
    await service.ingestDocument({
      collectionId: collection.id,
      title: "猫",
      sourceName: "",
      mime: "text/plain",
      text: "猫一天睡 12-16 小时。"
    });
    await service.flushQueue();

    const fakeChat = async (messages: Array<{ role: string; content: string }>): Promise<string> => {
      const system = messages[0]?.content ?? "";
      if (system.includes("检索问答助手")) {
        return "猫一天睡 12-16 小时。";
      }
      if (system.includes("忠实度评估器")) {
        return '{"claims":[{"text":"猫一天睡12-16小时","supported":true},{"text":"猫是爬行动物","supported":false}]}';
      }
      if (system.includes("回答相关性评估器")) {
        return '{"score":0.9}';
      }
      if (system.includes("相关性评估器")) {
        return '{"relevant":[true]}';
      }
      return "{}";
    };

    const result = await runRagasEval({
      service,
      completeChat: fakeChat as never,
      cases: [{ query: "猫睡多久" }],
      topK: 3
    });

    expect(result.cases).toHaveLength(1);
    expect(result.cases[0].faithfulness).toBeCloseTo(0.5);
    expect(result.cases[0].contextRelevance).toBe(1);
    expect(result.cases[0].answerRelevance).toBeCloseTo(0.9);
    expect(result.cases[0].unsupportedClaims).toEqual(["猫是爬行动物"]);
    db.close();
  });
});
