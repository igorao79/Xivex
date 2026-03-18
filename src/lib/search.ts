// Search module — Google search via Jina Reader + Wikimedia Commons for images
// No API keys needed

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

/**
 * Search via SearXNG — uses SEARXNG_URL env var (your own instance)
 * or falls back to public instances
 */
export async function searchGoogle(
  query: string,
  limit = 8
): Promise<SearchResult[]> {
  // Your own SearXNG instance first, then public fallbacks
  const instances = [
    process.env.SEARXNG_URL,
    "https://search.sapti.me",
    "https://priv.au",
    "https://searxng.site",
  ].filter(Boolean) as string[];

  for (const instance of instances) {
    try {
      const params = new URLSearchParams({
        q: query,
        format: "json",
        language: "auto",
        safesearch: "0",
      });

      const res = await fetch(`${instance}/search?${params}`, {
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (compatible; Xivex/1.0)",
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) continue;

      const data = await res.json();
      if (!data.results?.length) continue;

      const results: SearchResult[] = [];
      const seen = new Set<string>();

      for (const r of data.results) {
        if (!r.url || !r.title) continue;

        try {
          const parsed = new URL(r.url);
          const host = parsed.hostname.replace("www.", "");
          const key = host + parsed.pathname.replace(/\/$/, "");

          if (host.includes("facebook.com") || host.includes("x.com") ||
              host.includes("twitter.com") || host.includes("localhost"))
            continue;

          if (seen.has(key)) continue;
          seen.add(key);

          results.push({
            title: r.title.replace(/<[^>]+>/g, "").trim(),
            url: r.url,
            snippet: (r.content || "").replace(/<[^>]+>/g, "").trim().substring(0, 250),
            source: host,
          });

          if (results.length >= limit) break;
        } catch { continue; }
      }

      if (results.length > 0) return results;
    } catch { continue; }
  }

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
