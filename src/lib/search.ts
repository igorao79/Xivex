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
 * Search via DuckDuckGo HTML — direct fetch, parse HTML results
 */
export async function searchGoogle(
  query: string,
  limit = 8
): Promise<SearchResult[]> {
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

  try {
    const q = encodeURIComponent(query);
    const res = await fetch(
      `https://html.duckduckgo.com/html/?q=${q}`,
      {
        headers: {
          "User-Agent": ua,
          Accept: "text/html",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(12000),
      }
    );
    if (!res.ok) return [];

    const html = await res.text();
    const results: SearchResult[] = [];
    const seen = new Set<string>();

    // Parse DuckDuckGo HTML results
    // Results are in <a class="result__a" href="...">Title</a>
    // Snippets are in <a class="result__snippet" ...>Text</a>
    const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

    // Collect all titles+urls
    const entries: { title: string; url: string; snippet: string }[] = [];
    let match;

    while ((match = resultRegex.exec(html)) !== null) {
      let href = match[1];
      const rawTitle = match[2].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();

      // DDG wraps URLs: //duckduckgo.com/l/?uddg=ENCODED_URL&...
      if (href.includes("uddg=")) {
        const uddg = new URL("https:" + href).searchParams.get("uddg");
        if (uddg) href = uddg;
        else continue;
      }

      try {
        const parsed = new URL(href);
        const host = parsed.hostname.replace("www.", "");
        const key = host + parsed.pathname.replace(/\/$/, "");

        if (host.includes("duckduckgo.com") || host.includes("facebook.com") ||
            host.includes("x.com") || host.includes("twitter.com") || host.includes("localhost"))
          continue;

        if (seen.has(key)) continue;
        seen.add(key);

        entries.push({
          title: rawTitle.replace(/ - [^-]+$/, "").trim(),
          url: href.replace(/#.*$/, "").replace(/\/$/, ""),
          snippet: "",
        });
      } catch { continue; }
    }

    // Collect snippets
    let snippetIdx = 0;
    while ((match = snippetRegex.exec(html)) !== null && snippetIdx < entries.length) {
      const snippet = match[1]
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .trim()
        .substring(0, 250);
      if (snippet) {
        entries[snippetIdx].snippet = snippet;
      }
      snippetIdx++;
    }

    // Build results
    for (const entry of entries.slice(0, limit)) {
      try {
        const host = new URL(entry.url).hostname.replace("www.", "");
        results.push({
          title: entry.title,
          url: entry.url,
          snippet: entry.snippet,
          source: host,
        });
      } catch { continue; }
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
