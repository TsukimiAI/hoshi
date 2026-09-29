const WIKI_HOSTS = ["zh.wikipedia.org", "en.wikipedia.org"];
const MOEGIRL_APIS = [
  "https://zh.moegirl.org.cn/api.php",
  "https://mzh.moegirl.org.cn/api.php"
];

const FETCH_HEADERS = {
  "User-Agent": "Hoshi/0.1 (desktop workbench; knowledge cards)",
  Accept: "application/json"
};

export function thumbnailFromWikiSummary(json: unknown): string | null {
  if (!json || typeof json !== "object") {
    return null;
  }
  const rec = json as Record<string, unknown>;
  const thumb = rec.thumbnail;
  const original = rec.originalimage;
  const source =
    (thumb && typeof thumb === "object" && typeof (thumb as { source?: string }).source === "string"
      ? (thumb as { source: string }).source
      : "") ||
    (original && typeof original === "object" && typeof (original as { source?: string }).source === "string"
      ? (original as { source: string }).source
      : "");
  return httpsUrl(source);
}

export function thumbnailFromMoegirlQuery(json: unknown): string | null {
  if (!json || typeof json !== "object") {
    return null;
  }
  const query = (json as { query?: { pages?: Record<string, unknown> } }).query;
  const pages = query?.pages;
  if (!pages || typeof pages !== "object") {
    return null;
  }
  for (const page of Object.values(pages)) {
    if (!page || typeof page !== "object") {
      continue;
    }
    const rec = page as { thumbnail?: { source?: string }; original?: { source?: string } };
    const found = httpsUrl(rec.original?.source ?? rec.thumbnail?.source ?? "");
    if (found) {
      return found;
    }
  }
  return null;
}

function httpsUrl(raw: string): string | null {
  const source = raw.trim();
  const https = source.startsWith("//") ? `https:${source}` : source;
  return canonicalizeCanvasImageUrl(https);
}

const IMAGE_HOSTS = [
  "upload.wikimedia.org",
  "commons.wikimedia.org",
  "storage.moegirl.org.cn",
  "img.moegirl.org.cn",
  "img.moegirl.org"
];

export function canonicalizeCanvasImageUrl(raw: string): string | null {
  const source = raw.trim();
  if (!source) {
    return null;
  }
  try {
    const url = new URL(source);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    url.hash = "";
    const host = url.hostname.toLowerCase();
    const allowedHost = IMAGE_HOSTS.some((item) => host === item || host.endsWith(`.${item}`));
    const imagePath = /\.(png|jpe?g|webp|gif|svg|bmp)(?:$|[!/?#])/i.test(url.pathname);
    if (!allowedHost && !imagePath) {
      return null;
    }
    url.pathname = url.pathname.replace(/(\.(?:png|jpe?g|webp|gif|svg|bmp))!.+$/i, "$1");
    return url.toString();
  } catch {
    return null;
  }
}

export type PortraitFetcher = (name: string) => Promise<string | null>;

export function portraitTitleCandidates(query: string): string[] {
  const q = query
    .replace(/Ver\.?\s*[\d.]+/gi, " ")
    .replace(/[\s\u3000]+/g, " ")
    .trim();
  if (q.length < 2 || q.length > 80) {
    return [];
  }
  const parts = q.split(" ").filter(Boolean);
  const out: string[] = [];
  const add = (item: string, min = 2) => {
    const next = item.trim();
    if (next.length >= min && next.length <= 80 && !out.includes(next)) {
      out.push(next);
    }
  };
  if (parts.length > 1) {
    add(parts[parts.length - 1]);
    add(parts.join(""));
    add(parts[0]);
  }
  add(q);
  return out;
}

function searchTitlesFromMoegirl(json: unknown): string[] {
  const hits = (json as { query?: { search?: Array<{ title?: string }> } })?.query?.search ?? [];
  const out: string[] = [];
  for (const hit of hits) {
    const title = typeof hit?.title === "string" ? hit.title.trim() : "";
    if (title && !out.includes(title)) {
      out.push(title);
    }
  }
  return out.slice(0, 5);
}

async function fetchMoegirlPageImage(
  api: string,
  title: string,
  fetchImpl: typeof fetch
): Promise<string | null> {
  const url = `${api}?action=query&format=json&redirects=1&prop=pageimages&piprop=thumbnail|original&pithumbsize=800&origin=*&titles=${encodeURIComponent(title)}`;
  const response = await fetchImpl(url, {
    headers: FETCH_HEADERS,
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) {
    return null;
  }
  return thumbnailFromMoegirlQuery(await response.json());
}

export async function lookupPortraitUrl(
  name: string,
  fetchImpl: typeof fetch = fetch
): Promise<string | null> {
  const candidates = portraitTitleCandidates(name);
  if (candidates.length === 0) {
    return null;
  }
  for (const title of candidates) {
    for (const api of MOEGIRL_APIS) {
      try {
        const found = await fetchMoegirlPageImage(api, title, fetchImpl);
        if (found) {
          return found;
        }
        const searchUrl = `${api}?action=query&format=json&list=search&srnamespace=0&srlimit=5&origin=*&srsearch=${encodeURIComponent(title)}`;
        const searchRes = await fetchImpl(searchUrl, {
          headers: FETCH_HEADERS,
          signal: AbortSignal.timeout(8000)
        });
        if (!searchRes.ok) {
          continue;
        }
        for (const hit of searchTitlesFromMoegirl(await searchRes.json())) {
          if (hit === title) {
            continue;
          }
          const fromSearch = await fetchMoegirlPageImage(api, hit, fetchImpl);
          if (fromSearch) {
            return fromSearch;
          }
        }
      } catch {
        continue;
      }
    }
    for (const host of WIKI_HOSTS) {
      try {
        const url = `https://${host}/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
        const response = await fetchImpl(url, {
          headers: FETCH_HEADERS,
          signal: AbortSignal.timeout(8000)
        });
        if (!response.ok) {
          continue;
        }
        const found = thumbnailFromWikiSummary(await response.json());
        if (found) {
          return found;
        }
      } catch {
        continue;
      }
    }
  }
  return null;
}
