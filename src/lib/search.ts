// Search module — Tavily AI search + Wikimedia Commons for images
import { tavily } from "@tavily/core";

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

export interface ImageResult {
  title: string;
  url: string;
  image: string;
  thumbnail: string;
}

/**
 * Check if a page title is relevant to the query.
 * At least half of the significant query words must appear in the title.
 */
function isTitleRelevant(title: string, query: string): boolean {
  const stopWords = new Set([
    "the", "a", "an", "of", "in", "on", "at", "to", "for", "and", "or",
    "is", "was", "by", "with", "from", "as", "that", "this", "it",
  ]);
  const titleLower = title.toLowerCase();
  const queryWords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));
  if (queryWords.length === 0) return true;

  let matched = 0;
  for (const word of queryWords) {
    if (titleLower.includes(word)) matched++;
  }
  // At least half of significant query words must be in the title
  return matched >= Math.ceil(queryWords.length / 2);
}

/** Get Tavily client */
function getTavilyClient() {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return null;
  return tavily({ apiKey });
}

/** Extract readable content from a URL via Tavily */
export async function extractPageContent(urls: string[]): Promise<string[]> {
  const client = getTavilyClient();
  if (!client) return urls.map(() => "Error: TAVILY_API_KEY not configured");

  try {
    const result = await client.extract(urls);
    return result.results.map((r: any) => {
      const text = r.rawContent || r.text || "";
      return text.slice(0, 10000);
    });
  } catch {
    return urls.map(() => "Error: Could not extract page content");
  }
}

// Legacy parsers kept as fallback
/** Parse search results from SearXNG HTML page */
function parseSearXNGHtml(html: string, limit: number): SearchResult[] {
  const results: SearchResult[] = [];
  const seen = new Set<string>();

  // SearXNG HTML: <article class="result"> with <a href="URL"> and <h3>Title</h3> and <p class="content">
  const articleRegex = /<article[^>]*class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
  let match;

  while ((match = articleRegex.exec(html)) !== null && results.length < limit) {
    const block = match[1];

    // Extract URL from the first <a href="..."> inside <h3>
    const urlMatch = block.match(/<h3[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>/i)
      || block.match(/<a[^>]+href="(https?:\/\/[^"]+)"[^>]*class="[^"]*url[^"]*"/i)
      || block.match(/<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>/i);
    if (!urlMatch) continue;
    const url = urlMatch[1];

    // Extract title
    const titleMatch = block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    const title = titleMatch
      ? titleMatch[1].replace(/<[^>]+>/g, "").trim()
      : "";
    if (!title) continue;

    // Extract snippet
    const snippetMatch = block.match(/<p[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/p>/i)
      || block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const snippet = snippetMatch
      ? snippetMatch[1].replace(/<[^>]+>/g, "").trim().substring(0, 250)
      : "";

    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace("www.", "");
      const key = host + parsed.pathname.replace(/\/$/, "");

      if (host.includes("facebook.com") || host.includes("x.com") ||
          host.includes("twitter.com") || host.includes("localhost"))
        continue;
      if (seen.has(key)) continue;
      seen.add(key);

      results.push({ title, url, snippet, source: host });
    } catch { continue; }
  }

  return results;
}

/** Parse search results from DuckDuckGo HTML */
function parseDDGHtml(html: string, limit: number): SearchResult[] {
  const results: SearchResult[] = [];
  const seen = new Set<string>();

  const resultRegex = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRegex = /<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;

  const urls: string[] = [];
  const titles: string[] = [];
  const snippets: string[] = [];

  let m;
  while ((m = resultRegex.exec(html)) !== null) {
    urls.push(m[1]);
    titles.push(m[2].replace(/<[^>]+>/g, "").trim());
  }
  while ((m = snippetRegex.exec(html)) !== null) {
    snippets.push(m[1].replace(/<[^>]+>/g, "").trim());
  }

  for (let i = 0; i < urls.length && results.length < limit; i++) {
    let url = urls[i];
    // DDG wraps URLs in redirect: //duckduckgo.com/l/?uddg=...
    if (url.includes("uddg=")) {
      const decoded = decodeURIComponent(url.split("uddg=")[1]?.split("&")[0] || "");
      if (decoded) url = decoded;
    }
    if (!url.startsWith("http")) continue;

    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace("www.", "");
      const key = host + parsed.pathname.replace(/\/$/, "");
      if (seen.has(key)) continue;
      seen.add(key);

      results.push({
        title: titles[i] || "",
        url,
        snippet: (snippets[i] || "").substring(0, 250),
        source: host,
      });
    } catch { continue; }
  }

  return results;
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export async function searchGoogle(
  query: string,
  limit = 8
): Promise<SearchResult[]> {
  // 1. Tavily — best quality, includes content snippets
  const client = getTavilyClient();
  if (client) {
    try {
      const response = await client.search(query, {
        searchDepth: "advanced",
        maxResults: limit,
        includeAnswer: false,
      });

      if (response.results?.length) {
        const results: SearchResult[] = [];
        const seen = new Set<string>();

        for (const r of response.results) {
          if (!r.url || !r.title) continue;
          try {
            const parsed = new URL(r.url);
            const host = parsed.hostname.replace("www.", "");
            const key = host + parsed.pathname.replace(/\/$/, "");
            if (seen.has(key)) continue;
            seen.add(key);

            results.push({
              title: r.title,
              url: r.url,
              snippet: (r.content || "").substring(0, 300),
              source: host,
            });
            if (results.length >= limit) break;
          } catch { continue; }
        }

        if (results.length > 0) return results;
      }
    } catch (err) {
      console.error("Tavily search error:", err);
    }
  }

  // 2. DuckDuckGo HTML as fallback
  try {
    const q = encodeURIComponent(query);
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${q}`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const html = await res.text();
      const results = parseDDGHtml(html, limit);
      if (results.length > 0) return results;
    }
  } catch {}

  return [];
}

/**
 * Search Wikimedia Commons for images — with relevance filtering
 */
async function searchCommonsImages(
  queries: string[],
  limit = 4
): Promise<ImageResult[]> {
  const allResults: ImageResult[] = [];
  const seen = new Set<string>();

  for (const query of queries.slice(0, 3)) {
    try {
      const params = new URLSearchParams({
        action: "query",
        generator: "search",
        gsrsearch: query,
        gsrnamespace: "6",
        gsrlimit: String(limit + 4), // fetch extra to filter
        prop: "imageinfo",
        iiprop: "url|extmetadata",
        iiurlwidth: "500",
        format: "json",
      });

      const res = await fetch(
        `https://commons.wikimedia.org/w/api.php?${params}`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (!res.ok) continue;

      const data = await res.json();
      const pages = Object.values(data.query?.pages || {}) as any[];

      for (const page of pages) {
        const info = page.imageinfo?.[0];
        if (!info?.thumburl) continue;

        const fileTitle = (page.title || "").toLowerCase();
        if (fileTitle.endsWith(".svg") || fileTitle.includes("icon") || fileTitle.includes("logo") || fileTitle.includes("flag"))
          continue;
        const cleanTitle = fileTitle.replace("file:", "").replace(/\.[^.]+$/, "").trim();
        if (cleanTitle.split(/\s+/).length <= 1) continue;
        if (seen.has(info.thumburl)) continue;

        // Relevance check — file title or description must relate to query
        const desc =
          info.extmetadata?.ImageDescription?.value
            ?.replace(/<[^>]+>/g, "")
            ?.substring(0, 200) || "";
        const combinedText = cleanTitle + " " + desc.toLowerCase();
        if (!isTitleRelevant(combinedText, query)) continue;

        seen.add(info.thumburl);

        const displayTitle = desc.substring(0, 120) || page.title.replace("File:", "").replace(/\.[^.]+$/, "");

        allResults.push({
          title: displayTitle,
          url:
            info.descriptionurl ||
            `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`,
          image: info.thumburl,
          thumbnail: info.thumburl,
        });
      }
    } catch {
      continue;
    }
  }

  return allResults;
}

/**
 * Search Wikipedia for pages and get their thumbnails — with relevance filtering
 */
async function getWikiPageImages(queries: string[]): Promise<ImageResult[]> {
  const results: ImageResult[] = [];
  const seen = new Set<string>();

  for (const query of queries.slice(0, 4)) {
    try {
      const searchParams = new URLSearchParams({
        action: "query",
        generator: "search",
        gsrsearch: query,
        gsrlimit: "4",
        prop: "pageimages|description",
        pithumbsize: "500",
        format: "json",
      });

      const res = await fetch(`https://en.wikipedia.org/w/api.php?${searchParams}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;

      const data = await res.json();
      const pages = Object.values(data.query?.pages || {}) as any[];

      for (const p of pages) {
        if (!p.thumbnail?.source || seen.has(p.title)) continue;

        // Relevance check — page title must relate to query
        if (!isTitleRelevant(p.title, query)) continue;

        seen.add(p.title);
        results.push({
          title: p.title,
          url: `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, "_"))}`,
          image: p.thumbnail.source,
          thumbnail: p.thumbnail.source,
        });
      }
    } catch {
      continue;
    }
  }

  return results;
}

/**
 * Main search — Google via Jina for diverse articles + Wikimedia for images
 */
export async function searchForTopics(
  queries: string[]
): Promise<{ articles: SearchResult[]; images: ImageResult[] }> {
  const [googleResults, commonsImages, pageImages] = await Promise.all([
    // Google search for diverse articles
    Promise.all(queries.slice(0, 3).map((q) => searchGoogle(q, 5))),
    // Wikimedia Commons
    searchCommonsImages(queries, 4),
    // Wikipedia page images
    getWikiPageImages(queries),
  ] as const);

  // Deduplicate articles
  const uniqueArticles = new Map<string, SearchResult>();
  for (const batch of googleResults) {
    for (const r of batch) {
      const key = r.source + new URL(r.url).pathname;
      if (!uniqueArticles.has(key)) {
        uniqueArticles.set(key, r);
      }
    }
  }

  // Deduplicate images — Wikipedia page images first (more relevant), then Commons
  const uniqueImages = new Map<string, ImageResult>();
  for (const img of [...pageImages, ...commonsImages]) {
    if (!uniqueImages.has(img.image) && img.title.trim().length > 0) {
      uniqueImages.set(img.image, img);
    }
  }

  return {
    articles: Array.from(uniqueArticles.values()).slice(0, 10),
    images: Array.from(uniqueImages.values()).slice(0, 10),
  };
}
