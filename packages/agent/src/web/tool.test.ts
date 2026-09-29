import { describe, expect, it } from "vitest";
import { extractOptionalAnswer, extractWebSearchHits, searchDeepSeekOfficial } from "./deepseekSearch";
import { htmlToMarkdown, publicHttpUrl, fetchPublicPage } from "./fetchPage";
import { mergeHitsByUrl, normalizeQueries } from "./merge";
import { resolveDeepseekSearchKey, WebToolHost } from "./tool";

describe("normalizeQueries", () => {
  it("去重并最多 4 条", () => {
    expect(normalizeQueries({ queries: ["a", "a", "b", "c", "d", "e"] })).toEqual(["a", "b", "c", "d"]);
  });

  it("缺查询则报错文案", () => {
    expect(normalizeQueries({})).toBe("需要 1 到 4 条查询");
  });
});

describe("mergeHitsByUrl", () => {
  it("按来源轮询去重最多 8 条", () => {
    const merged = mergeHitsByUrl([
      [
        { url: "https://a.com/1", title: "a1" },
        { url: "https://a.com/2", title: "a2" },
        { url: "https://dup.com", title: "dup-a" }
      ],
      [
        { url: "https://dup.com", title: "dup-b" },
        { url: "https://b.com/1", title: "b1" }
      ]
    ]);
    expect(merged.map((item) => item.url)).toEqual([
      "https://a.com/1",
      "https://dup.com",
      "https://a.com/2",
      "https://b.com/1"
    ]);
  });
});

describe("extractWebSearchHits", () => {
  it("只用结果块，不用模型正文", () => {
    const hits = extractWebSearchHits({
      content: [
        { type: "text", text: "这不是答案" },
        {
          type: "web_search_tool_result",
          content: [
            {
              type: "web_search_result",
              url: "https://example.com/w",
              title: "上海天气",
              page_age: "2026-09-28",
              snippet: "最高 28"
            }
          ]
        }
      ]
    });
    expect(hits).toEqual([
      {
        url: "https://example.com/w",
        title: "上海天气",
        date: "2026-09-28",
        snippet: "最高 28"
      }
    ]);
    expect(extractOptionalAnswer({ content: [{ type: "text", text: "这不是答案" }] })).toBe("这不是答案");
  });

  it("没有结果块则空", () => {
    expect(extractWebSearchHits({ content: [{ type: "text", text: "hi" }] })).toEqual([]);
  });
});

describe("searchDeepSeekOfficial", () => {
  it("响应没有结果块当作提供方错误", async () => {
    await expect(
      searchDeepSeekOfficial("q", "key", async () =>
        new Response(JSON.stringify({ content: [{ type: "text", text: "无" }] }), { status: 200 })
      )
    ).rejects.toThrow("没有检索结果块");
  });
});

describe("fetchPublicPage", () => {
  it("拒绝内网和重定向", async () => {
    expect(publicHttpUrl("http://127.0.0.1/x")).toBeNull();
    const text = await fetchPublicPage("https://example.com/a", async () =>
      new Response("", { status: 302, headers: { location: "https://evil.example/b" } })
    );
    expect(text).toContain("已拒绝跟随重定向");
    expect(text).toContain("https://evil.example/b");
  });

  it("HTML 去掉脚本再转 Markdown", () => {
    expect(htmlToMarkdown("<script>alert(1)</script><h1>Hi</h1><p>ok</p>")).toContain("# Hi");
    expect(htmlToMarkdown("<script>alert(1)</script><h1>Hi</h1>")).not.toContain("alert");
  });

  it("百度百科直接判定无法抓取", async () => {
    let called = 0;
    const text = await fetchPublicPage("https://baike.baidu.com/item/x", async () => {
      called += 1;
      return new Response("nope", { status: 200 });
    });
    expect(called).toBe(0);
    expect(text).toContain("抓取失败");
    expect(text).toContain("baike.baidu.com");
  });

  it("萌百镜像走 MediaWiki extracts，不抓 HTML", async () => {
    const urls: string[] = [];
    const text = await fetchPublicPage("https://moegirl.uk/%E6%A4%8E%E5%90%8D%E7%9C%9F%E6%98%BC", async (input) => {
      urls.push(String(input));
      return new Response(
        JSON.stringify({
          query: { pages: { "1": { title: "椎名真昼", extract: "女主角。" } } }
        }),
        { headers: { "content-type": "application/json" } }
      );
    });
    expect(urls).toEqual([
      expect.stringContaining("https://zh.moegirl.org.cn/api.php")
    ]);
    expect(text).toContain("椎名真昼");
    expect(text).toContain("女主角");
    expect(text).toContain("维基开放接口");
  });
});

describe("WebToolHost", () => {
  it("同一查询只打一次，任一条失败丢掉整批", async () => {
    const calls: string[] = [];
    const host = new WebToolHost(
      () => "key",
      async (query) => {
        calls.push(query);
        if (query === "bad") {
          throw new Error("provider down");
        }
        return { hits: [{ url: `https://x.com/${query}`, title: query }], optionalAnswer: "" };
      }
    );
    host.setEnabled(true);
    const ok = await host.execute("web_search", { queries: ["one", "one", "two"] });
    expect(calls).toEqual(["one", "two"]);
    expect(ok).toContain("外部数据");
    expect(ok).toContain("https://x.com/one");
    const failed = await host.execute("web_search", { queries: ["ok", "bad"] });
    expect(failed).toContain("整批结果已丢弃");
    expect(failed).toContain("provider down");
  });

  it("缺密钥时工具仍在，执行时报结构化错误", async () => {
    const host = new WebToolHost(() => "");
    host.setEnabled(true);
    expect(host.tools().map((tool) => tool.function.name)).toEqual(["web_search", "web_fetch"]);
    expect(await host.execute("web_search", { query: "天气" })).toContain("缺少 DeepSeek API Key");
  });
});

describe("resolveDeepseekSearchKey", () => {
  it("专用密钥优先，否则 DeepSeek Base URL 复用模型密钥", () => {
    expect(
      resolveDeepseekSearchKey({
        deepseekApiKey: "ds",
        modelApiKey: "model",
        modelBaseUrl: "https://api.deepseek.com"
      })
    ).toBe("ds");
    expect(
      resolveDeepseekSearchKey({
        deepseekApiKey: "",
        modelApiKey: "model",
        modelBaseUrl: "https://api.deepseek.com/v1"
      })
    ).toBe("model");
    expect(
      resolveDeepseekSearchKey({
        deepseekApiKey: "",
        modelApiKey: "dash",
        modelBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1"
      })
    ).toBe("");
  });
});
