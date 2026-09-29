import { describe, expect, it } from "vitest";
import { lookupPortraitUrl, portraitTitleCandidates, thumbnailFromMoegirlQuery, thumbnailFromWikiSummary } from "./portrait";

describe("thumbnailFromWikiSummary", () => {
  it("取 thumbnail.source", () => {
    expect(
      thumbnailFromWikiSummary({
        thumbnail: { source: "https://upload.wikimedia.org/a.jpg" }
      })
    ).toBe("https://upload.wikimedia.org/a.jpg");
    expect(thumbnailFromWikiSummary({ thumbnail: { source: "http://insecure" } })).toBeNull();
  });
});

describe("thumbnailFromMoegirlQuery", () => {
  it("取 pageimages 缩略图", () => {
    expect(
      thumbnailFromMoegirlQuery({
        query: {
          pages: {
            "12": { thumbnail: { source: "https://img.moegirl.org.cn/c.jpg" } }
          }
        }
      })
    ).toBe("https://img.moegirl.org.cn/c.jpg");
  });

  it("优先原图并去掉水印处理链", () => {
    expect(
      thumbnailFromMoegirlQuery({
        query: {
          pages: {
            "12": {
              thumbnail: {
                source:
                  "https://storage.moegirl.org.cn/moegirl/commons/3/3c/x.PNG!/fw/480/watermark/url/abc==/align/southeast"
              },
              original: { source: "https://storage.moegirl.org.cn/moegirl/commons/3/3c/x.PNG" }
            }
          }
        }
      })
    ).toBe("https://storage.moegirl.org.cn/moegirl/commons/3/3c/x.PNG");
  });
});

describe("lookupPortraitUrl", () => {
  it("萌百命中则不再请求维基", async () => {
    const urls: string[] = [];
    const found = await lookupPortraitUrl("椎名真昼", async (input) => {
      urls.push(String(input));
      return {
        ok: true,
        json: async () => ({
          query: { pages: { "1": { thumbnail: { source: "https://img.moegirl.org.cn/m.jpg" } } } }
        })
      } as Response;
    });
    expect(found).toBe("https://img.moegirl.org.cn/m.jpg");
    expect(urls[0]).toContain("moegirl");
    expect(urls.some((item) => item.includes("wikipedia"))).toBe(false);
  });

  it("萌百没有时回落到维基", async () => {
    const found = await lookupPortraitUrl("爱因斯坦", async (input) => {
      const url = String(input);
      if (url.includes("moegirl")) {
        return { ok: false, json: async () => ({}) } as Response;
      }
      return {
        ok: true,
        json: async () => ({ thumbnail: { source: "https://upload.wikimedia.org/e.jpg" } })
      } as Response;
    });
    expect(found).toBe("https://upload.wikimedia.org/e.jpg");
  });

  it("作品+人名先查角色名精确标题", async () => {
    const urls: string[] = [];
    const found = await lookupPortraitUrl("邻家天使 椎名真昼", async (input) => {
      urls.push(String(input));
      const url = String(input);
      if (url.includes("titles=") && decodeURIComponent(url).includes("椎名真昼") && !url.includes("srsearch")) {
        return {
          ok: true,
          json: async () => ({
            query: { pages: { "1": { thumbnail: { source: "https://img.moegirl.org.cn/m.jpg" } } } }
          })
        } as Response;
      }
      return { ok: false, json: async () => ({}) } as Response;
    });
    expect(portraitTitleCandidates("邻家天使 椎名真昼")[0]).toBe("椎名真昼");
    expect(portraitTitleCandidates("鸣潮 Ver.3.7")).toEqual(["鸣潮"]);
    expect(portraitTitleCandidates("鸣潮 心")).toEqual(["鸣潮心", "鸣潮", "鸣潮 心"]);
    expect(found).toBe("https://img.moegirl.org.cn/m.jpg");
    expect(decodeURIComponent(urls[0] ?? "")).toContain("titles=椎名真昼");
  });
});
