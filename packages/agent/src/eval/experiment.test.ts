import { describe, expect, it } from "vitest";
import { compareBaseline } from "./compare";
import { scoreInjectParaphrase, scoreRouter } from "./evaluators";
import { loadInjectDataset, loadKbCorpus, loadKbQrels, loadRouterDataset } from "./load";
import { parseEnvText } from "./settings";
import type { BaselineFile, ExperimentRecord } from "./types";

function baseline(partial?: Partial<BaselineFile>): BaselineFile {
  return {
    datasets: {
      router: "1",
      "memory-inject-paraphrase": "1"
    },
    embeddingModel: "text-embedding-v4",
    chatModel: "qwen-plus",
    metrics: {},
    ...partial
  };
}

function record(partial?: Partial<ExperimentRecord>): ExperimentRecord {
  return {
    experimentId: "t",
    createdAt: "2026-01-01T00:00:00.000Z",
    tier: "offline",
    datasets: [
      { name: "router", version: "1", n: 1 },
      { name: "memory-inject-paraphrase", version: "1", n: 1 }
    ],
    search: { topK: 5, queryRewrite: "off", rerank: false, embeddingModel: "text-embedding-v4" },
    metrics: {},
    failures: [],
    ...partial
  };
}

describe("eval env", () => {
  it("解析仓库 .env 文本且忽略注释", () => {
    const parsed = parseEnvText("HOSHI_API_KEY=abc\n# x=1\nHOSHI_MODEL=\"qwen-plus\"\n");
    expect(parsed.HOSHI_API_KEY).toBe("abc");
    expect(parsed.HOSHI_MODEL).toBe("qwen-plus");
    expect(parsed.x).toBeUndefined();
  });
});

describe("eval datasets", () => {
  it("router 约 40 条", () => {
    expect(loadRouterDataset().cases).toHaveLength(40);
  });

  it("知识库 8 篇 20 题", () => {
    expect(loadKbCorpus().documents).toHaveLength(8);
    expect(loadKbQrels().cases).toHaveLength(20);
  });
});

describe("eval evaluators", () => {
  it("换说法一条都没注入时精确率和召回率记 0", () => {
    const scored = scoreInjectParaphrase([
      {
        id: "empty",
        query: "喝什么",
        memories: [{ id: "tea", text: "老师平时喜欢喝红茶", kind: "preference", topic: "drink" }],
        expectIds: ["tea"]
      }
    ]);
    expect(scored.metrics["memory.inject.precision"]?.value).toBe(0);
    expect(scored.metrics["memory.inject.recall"]?.value).toBe(0);
    expect(scored.failures[0]?.reason).toMatch(/injected none/);
  });

  it("路由三项分开计", () => {
    const scored = scoreRouter(loadRouterDataset().cases.slice(0, 3));
    expect(scored.metrics["router.web.accuracy"]?.n).toBe(3);
    expect(scored.metrics["router.kb.accuracy"]?.n).toBe(3);
    expect(scored.metrics["router.desk.accuracy"]?.n).toBe(3);
  });

  it("全量 router 无失败", () => {
    const scored = scoreRouter(loadRouterDataset().cases);
    expect(scored.failures).toEqual([]);
    expect(scored.metrics["router.kb.accuracy"]?.value).toBe(1);
    expect(scored.metrics["router.web.accuracy"]?.value).toBe(1);
    expect(scored.metrics["router.desk.accuracy"]?.value).toBe(1);
  });
});

describe("eval baseline", () => {
  it("基线没有的评分只打印", () => {
    const compared = compareBaseline(
      record({
        metrics: { "router.web.accuracy": { value: 0.5, n: 10, kind: "code" } }
      }),
      baseline()
    );
    expect(compared.ok).toBe(true);
  });

  it("数据集版本对不上则基线过期", () => {
    const compared = compareBaseline(record(), baseline({ datasets: { router: "2" } }));
    expect(compared.ok).toBe(false);
    expect(compared.reasons.join("\n")).toMatch(/基线过期/);
  });

  it("代码分低于基线失败", () => {
    const compared = compareBaseline(
      record({
        metrics: { "router.web.accuracy": { value: 0.4, n: 10, kind: "code" } }
      }),
      baseline({ metrics: { "router.web.accuracy": 0.8 } })
    );
    expect(compared.ok).toBe(false);
    expect(compared.reasons.join("\n")).toMatch(/router.web.accuracy/);
  });

  it("模型分在 0.05 内通过", () => {
    const compared = compareBaseline(
      record({
        chatModel: "qwen-plus",
        metrics: { "ragas.faithfulness": { value: 0.76, n: 20, kind: "model" } }
      }),
      baseline({ metrics: { "ragas.faithfulness": 0.8 } })
    );
    expect(compared.ok).toBe(true);
  });
});
