import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import type { KnowledgeSettings } from "@hoshi/shared";
import { DEFAULT_HOSHI_SETTINGS } from "@hoshi/shared";
import { migrateDb } from "../storage/db";
import type { EmbeddingProvider } from "./embedding";
import { KnowledgeService } from "./service";
import { contextMentionsQuery, runRagasEval, stripModelThinking } from "./ragas";

function keywordEmbedding(): EmbeddingProvider {
  return {
    modelKey: () => "fake:ragas",
    async embed(texts: string[]): Promise<number[][]> {
      return texts.map((text) => (text.includes("猫") ? [1, 0, 0, 0] : [0, 0, 0, 0]));
    }
  };
}

describe("contextMentionsQuery", () => {
  it("资料里有主题词时判定相关", () => {
    const stock = "股票投资应分散风险，长期持有比频繁交易更稳健。";
    expect(contextMentionsQuery("股票为什么要分散风险", stock)).toBe(true);
    expect(contextMentionsQuery("淡季机票贵不贵", "猫通常每天睡 12-16 小时。")).toBe(false);
  });
});

describe("stripModelThinking", () => {
  it("去掉思考块，保留回答", () => {
    expect(stripModelThinking("<think>推理</think>\n猫一天睡 12-16 小时。")).toBe("猫一天睡 12-16 小时。");
    expect(stripModelThinking("猫一天睡 12-16 小时。")).toBe("猫一天睡 12-16 小时。");
  });
});

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
        return "<think>先看资料</think>猫一天睡 12-16 小时。";
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
    expect(result.cases[0].answer).toBe("猫一天睡 12-16 小时。");
    expect(result.cases[0].faithfulness).toBeCloseTo(0.5);
    expect(result.cases[0].contextRelevance).toBe(1);
    expect(result.cases[0].answerRelevance).toBeCloseTo(0.9);
    expect(result.cases[0].unsupportedClaims).toEqual(["猫是爬行动物"]);
    expect(result.skipped).toEqual([]);
    db.close();
  });

  it("资料里已有主题时，不接受没有信息", async () => {
    const db = new DatabaseSync(":memory:", { allowExtension: true });
    migrateDb(db);
    const embedding: EmbeddingProvider = {
      modelKey: () => "fake:stock",
      async embed(texts: string[]): Promise<number[][]> {
        return texts.map(() => [1, 0, 0, 0]);
      }
    };
    const service = new KnowledgeService(db, embedding, DEFAULT_HOSHI_SETTINGS.knowledge as KnowledgeSettings);
    const collection = await service.createCollection("库");
    await service.ingestDocument({
      collectionId: collection.id,
      title: "股票",
      sourceName: "",
      mime: "text/plain",
      text: "股票投资应分散风险，长期持有比频繁交易更稳健。"
    });
    await service.flushQueue();

    let generations = 0;
    const fakeChat = async (messages: Array<{ role: string; content: string }>): Promise<string> => {
      const system = messages[0]?.content ?? "";
      if (system.includes("检索问答助手")) {
        generations += 1;
        return generations === 1 ? "资料中没有相关信息" : "股票投资应分散风险。";
      }
      if (system.includes("忠实度评估器")) {
        return '{"claims":[{"text":"股票投资应分散风险","supported":true}]}';
      }
      if (system.includes("回答相关性评估器")) {
        return '{"score":0.9}';
      }
      return '{"relevant":[true]}';
    };

    const result = await runRagasEval({
      service,
      completeChat: fakeChat as never,
      cases: [{ query: "股票为什么要分散风险" }],
      topK: 3
    });
    expect(generations).toBe(2);
    expect(result.cases[0].answer).toBe("股票投资应分散风险。");
    db.close();
  });

  it("单题模型失败不中断整轮", async () => {
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

    const fakeChat = async (): Promise<string> => {
      throw new Error("模型请求超时");
    };

    const result = await runRagasEval({
      service,
      completeChat: fakeChat,
      cases: [{ query: "猫睡多久" }],
      topK: 3
    });
    expect(result.cases).toHaveLength(0);
    expect(result.skipped).toEqual([{ query: "猫睡多久", reason: "模型请求超时" }]);
    db.close();
  });
});
