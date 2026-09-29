import { describe, expect, it, vi } from "vitest";
import { DashScopeRerank } from "./rerank";

describe("DashScopeRerank", () => {
  it("发送正确请求并按 index 解析结果", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output: {
          results: [
            { index: 0, relevance_score: 0.9 },
            { index: 2, relevance_score: 0.5 },
            { index: 1, relevance_score: 0.7 }
          ]
        }
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const rerank = new DashScopeRerank(() => ({ apiKey: "k", baseUrl: "http://x/rerank", model: "m" }));
    const result = await rerank.rerank("q", [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
      { id: "c", text: "C" }
    ]);

    expect(result.map((item) => item.id)).toEqual(["a", "c", "b"]);
    expect(result[0]).toEqual({ id: "a", score: 0.9 });
    expect(result[2].score).toBe(0.7);

    const call = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(call[0]).toBe("http://x/rerank");
    const body = JSON.parse(String(call[1].body)) as Record<string, unknown>;
    expect(body.model).toBe("m");
    expect((body.input as Record<string, unknown>).query).toBe("q");
    expect((body.input as Record<string, unknown>).documents).toEqual(["A", "B", "C"]);
    expect((body.parameters as Record<string, unknown>).return_documents).toBe(false);

    vi.unstubAllGlobals();
  });

  it("非 2xx 抛出错误", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => "bad" }));
    const rerank = new DashScopeRerank(() => ({ apiKey: "k", baseUrl: "", model: "m" }));
    await expect(rerank.rerank("q", [{ id: "a", text: "A" }])).rejects.toThrow("Rerank request failed");
    vi.unstubAllGlobals();
  });
});
