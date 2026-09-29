const PRIVATE_HOST =
  /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1|0\.0\.0\.0)/i;

export function publicHttpUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    const host = url.hostname.toLowerCase();
    if (!host || PRIVATE_HOST.test(host) || host.endsWith(".local")) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function stripHiddenHtml(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, "")
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, "")
    .replace(/<[^>]*\bhidden\b[^>]*>[\s\S]*?<\/[^>]+>/gi, "")
    .replace(/<[^>]*aria-hidden=["']true["'][^>]*>[\s\S]*?<\/[^>]+>/gi, "")
    .replace(/<[^>]*style=["'][^"']*display\s*:\s*none[^"']*["'][^>]*>[\s\S]*?<\/[^>]+>/gi, "");
}

export function htmlToMarkdown(html: string): string {
  const cleaned = stripHiddenHtml(html);
  const withBreaks = cleaned
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/h[1-3]>/gi, "\n\n")
    .replace(/<h1[^>]*>/gi, "# ")
    .replace(/<h2[^>]*>/gi, "## ")
    .replace(/<h3[^>]*>/gi, "### ")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_all, href, text) => {
      const label = String(text).replace(/<[^>]+>/g, "").trim() || href;
      return `[${label}](${href})`;
    });
  return withBreaks
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function looksLikeChallenge(status: number, text: string): boolean {
  if (status === 403 || status === 429 || status === 503) {
    return true;
  }
  return /just a moment|attention required|百度安全验证|安全验证|人机验证|cf-browser-verification|captcha|access denied|checking your browser/i.test(
    text.slice(0, 2000)
  );
}

function challengeHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "baike.baidu.com" || host.endsWith(".baike.baidu.com");
  } catch {
    return false;
  }
}

const FETCH_MAX_CHARS = 12000;
const MOEGIRL_API = "https://zh.moegirl.org.cn/api.php";
const WIKI_UA = "Hoshi/0.1 (desktop workbench; web_fetch)";

export type WikiExtractTarget =
  | { kind: "moegirl"; title: string }
  | { kind: "wikipedia"; title: string; host: string };

function decodeTitle(raw: string): string {
  try {
    return decodeURIComponent(raw.replace(/_/g, " ")).trim();
  } catch {
    return raw.replace(/_/g, " ").trim();
  }
}

function isMoegirlHost(host: string): boolean {
  return (
    host === "moegirl.uk" ||
    host.endsWith(".moegirl.uk") ||
    host === "moegirl.icu" ||
    host.endsWith(".moegirl.icu") ||
    host === "moegirl.org.cn" ||
    host.endsWith(".moegirl.org.cn")
  );
}

export function wikiExtractTarget(rawUrl: string): WikiExtractTarget | null {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    if (isMoegirlHost(host)) {
      const titleParam = url.searchParams.get("title") ?? "";
      const path = url.pathname.replace(/^\/(zh-cn|zh-hans|zh-hant|zh|index\.php)(?=\/|$)/i, "");
      const leaf = decodeTitle(titleParam || path.replace(/^\//, "").split("/")[0] || "");
      if (!leaf || /^(Special|File|Category|Template|User):/i.test(leaf)) {
        return null;
      }
      return { kind: "moegirl", title: leaf };
    }
    if (host.endsWith(".wikipedia.org") || host === "wikipedia.org") {
      const match = url.pathname.match(/^\/wiki\/([^/]+)/i);
      const leaf = decodeTitle(match?.[1] ?? "");
      if (!leaf || /^(Special|File|Category|Template|User):/i.test(leaf)) {
        return null;
      }
      return { kind: "wikipedia", title: leaf, host };
    }
    return null;
  } catch {
    return null;
  }
}

function extractFromPages(json: unknown): string {
  if (!json || typeof json !== "object") {
    return "";
  }
  const pages = (json as { query?: { pages?: Record<string, unknown> } }).query?.pages;
  if (!pages || typeof pages !== "object") {
    return "";
  }
  for (const page of Object.values(pages)) {
    if (!page || typeof page !== "object") {
      continue;
    }
    const rec = page as { missing?: boolean; extract?: string; title?: string };
    if (rec.missing || typeof rec.extract !== "string" || !rec.extract.trim()) {
      continue;
    }
    const heading = typeof rec.title === "string" && rec.title ? `# ${rec.title}\n\n` : "";
    return `${heading}${rec.extract.trim()}`;
  }
  return "";
}

async function fetchWikiExtract(
  target: WikiExtractTarget,
  fetchImpl: typeof fetch,
  signal?: AbortSignal
): Promise<string> {
  const encoded = encodeURIComponent(target.title);
  const api =
    target.kind === "moegirl"
      ? `${MOEGIRL_API}?action=query&format=json&redirects=1&prop=extracts&explaintext=1&exsectionformat=plain&origin=*&titles=${encoded}`
      : `https://${target.host}/w/api.php?action=query&format=json&redirects=1&prop=extracts&explaintext=1&exsectionformat=plain&origin=*&titles=${encoded}`;
  const response = await fetchImpl(api, {
    method: "GET",
    headers: { "user-agent": WIKI_UA, accept: "application/json" },
    signal
  });
  if (!response.ok) {
    return "";
  }
  return extractFromPages(await response.json());
}

export async function fetchPublicPage(
  rawUrl: string,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<string> {
  const url = publicHttpUrl(rawUrl);
  if (!url) {
    return "抓取结果：不是可访问的公网 http(s) 地址";
  }
  if (challengeHost(url)) {
    return `抓取失败：${new URL(url).hostname} 需要浏览器验证，无法读取正文，请用来源摘录`;
  }
  const wiki = wikiExtractTarget(url);
  if (wiki) {
    try {
      const extract = await fetchWikiExtract(wiki, fetchImpl, signal);
      if (extract) {
        const clipped = extract.slice(0, FETCH_MAX_CHARS);
        return `抓取结果：status=200 url=${url}\n（维基开放接口）\n${clipped}`;
      }
    } catch {
      /* 再试页面 HTML */
    }
  }
  const response = await fetchImpl(url, {
    method: "GET",
    redirect: "manual",
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      accept: "text/html,text/plain,application/xhtml+xml"
    },
    signal
  });
  const location = response.headers.get("location") ?? "";
  if (response.status >= 300 && response.status < 400) {
    return `抓取结果：status=${response.status}，已拒绝跟随重定向${location ? ` Location=${location}` : ""}`;
  }
  const contentType = response.headers.get("content-type") ?? "";
  const body = await response.text();
  const text = /html/i.test(contentType) || /<[a-z][\s\S]*>/i.test(body.slice(0, 400))
    ? htmlToMarkdown(body)
    : body.trim();
  if (looksLikeChallenge(response.status, `${body}\n${text}`)) {
    return `抓取失败：该页面需要人机验证，无法读取正文（${new URL(url).hostname}）`;
  }
  const clipped = text.slice(0, FETCH_MAX_CHARS);
  const prefix = `抓取结果：status=${response.status} url=${url}`;
  if (!clipped) {
    return `${prefix}\n（正文为空）`;
  }
  return `${prefix}\n${clipped}`;
}
