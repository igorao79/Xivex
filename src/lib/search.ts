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
 * Search via DuckDuckGo + Jina Reader — parses titles, URLs, and snippets
 */
export async function searchGoogle(
  query: string,
  limit = 8
): Promise<SearchResult[]> {
  try {
    const q = encodeURIComponent(query);
    const res = await fetch(
      `https://r.jina.ai/https://html.duckduckgo.com/html/?q=${q}`,
      {
        headers: { Accept: "text/plain" },
        signal: AbortSignal.timeout(15000),
      }
    );
    if (!res.ok) return [];

    const text = await res.text();
    const results: SearchResult[] = [];
    const seen = new Set<string>();

    // DuckDuckGo results come as [Title](duckduckgo.com/l/?uddg=encoded_url)
    // Each result appears 3 times: title link, bare URL link, snippet link
    // We collect them in groups
    const linkRegex = /\[([^\]]{5,})\]\(https:\/\/duckduckgo\.com\/l\/\?uddg=([^&\s)]+)/g;

    let match;
    const rawEntries: { title: string; url: string; snippet: string }[] = [];

    while ((match = linkRegex.exec(text)) !== null) {
      const rawTitle = match[1].trim();
      const encodedUrl = match[2];

      let url: string;
      try {
        url = decodeURIComponent(encodedUrl);
      } catch {
        continue;
      }

      // Skip DDG ad tracking URLs
      if (url.includes("duckduckgo.com/y.js")) continue;
      if (url.includes("duckduckgo.com")) continue;

      try {
        const parsed = new URL(url);
        const host = parsed.hostname.replace("www.", "");
        const key = host + parsed.pathname.replace(/\/$/, "");

        // Skip social media and noise
        if (
          host.includes("facebook.com") ||
          host.includes("x.com") ||
          host.includes("twitter.com") ||
          host.includes("youtube.com") ||
          host.includes("localhost")
        )
          continue;

        // Check if it's a title (not a bare URL, not bold snippet text)
        const isBareUrl = rawTitle === url || rawTitle.startsWith("http") || rawTitle.startsWith("www.");
        const isSnippet = rawTitle.includes("**") || rawTitle.length > 100;

        if (isBareUrl) continue;

        if (isSnippet) {
          // This is a snippet for the previous entry
          if (rawEntries.length > 0 && rawEntries[rawEntries.length - 1].url === url) {
            const cleanSnippet = rawTitle
              .replace(/\*\*/g, "")
              .replace(/<[^>]+>/g, "")
              .trim();
            rawEntries[rawEntries.length - 1].snippet = cleanSnippet.substring(0, 250);
          }
          continue;
        }

        // It's a title
        if (seen.has(key)) continue;
        seen.add(key);

        rawEntries.push({
          title: rawTitle.replace(/ - [^-]+$/, "").trim(),
          url: url.replace(/#.*$/, "").replace(/\/$/, ""),
          snippet: "",
        });
      } catch {
        continue;
      }
    }

    // Build results
    for (const entry of rawEntries.slice(0, limit)) {
      try {
        const parsed = new URL(entry.url);
        const host = parsed.hostname.replace("www.", "");
        results.push({
          title: entry.title,
          url: entry.url,
          snippet: entry.snippet,
          source: host,
        });
      } catch {
        continue;
      }
    }

    return results;
  } catch {
    return [];
  }
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
