import { describe, expect, it } from "vitest";
import { KnowledgeToolHost } from "./tool";
import type { KnowledgeService } from "./service";
import type { KnowledgeSearchHit } from "./types";

function hit(
  partial: Pick<KnowledgeSearchHit, "text" | "documentTitle"> & Partial<KnowledgeSearchHit>
): KnowledgeSearchHit {
  return {
    chunkId: "c1",
    docId: "d1",
    collectionId: "k1",
    collectionName: "库",
    score: 0.9,
    seq: 0,
    ...partial
  };
}

describe("KnowledgeToolHost", () => {
  it("丢掉与问句无关的最近邻讲义", async () => {
    const host = new KnowledgeToolHost({
      isEnabled: () => true,
      contextBudgetChars: () => 2400,
      expandHitContext: async (item: KnowledgeSearchHit) => item.text,
      search: async () => [
        hit({
          documentTitle: "MIT 6",
          text: "如果你看一下二进制的布局，这有一些文本T，数据段D，通常还有所谓的BSS段。"
        })
      ]
    } as unknown as KnowledgeService);

    const result = await host.execute("search_knowledge", { query: "本月上海天气" });
    expect(result).toContain("没有与该问题相关");
    expect(result).not.toContain("BSS");
  });

  it("列出知识库文件名", async () => {
    const host = new KnowledgeToolHost({
      isEnabled: () => true,
      listCatalog: async () => [
        { title: "MIT 6", collectionName: "讲义", sourceName: "mit6.pdf", chunkCount: 12 }
      ]
    } as unknown as KnowledgeService);

    expect(host.tools().some((tool) => tool.function.name === "list_knowledge")).toBe(true);
    const result = await host.execute("list_knowledge", {});
    expect(result).toContain("MIT 6");
    expect(result).toContain("讲义");
    expect(result).toContain("mit6.pdf");
  });
});
