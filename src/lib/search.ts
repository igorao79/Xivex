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
 * Search Google via Jina Reader — parses real search result titles, URLs, and snippets
 */
export async function searchGoogle(
  query: string,
  limit = 8
): Promise<SearchResult[]> {
  try {
    const q = encodeURIComponent(query);
    const res = await fetch(
      `https://r.jina.ai/https://www.google.com/search?q=${q}&num=10&hl=en`,
      {
        headers: { Accept: "text/plain" },
        signal: AbortSignal.timeout(15000),
      }
    );
    if (!res.ok) return [];

    const rawText = await res.text();
    // Join broken lines — Jina sometimes splits a single [### ...](url) across lines
    const text = rawText.replace(/\n(?!\[|\*|#|$)/g, " ");
    const results: SearchResult[] = [];
    const seen = new Set<string>();

    // Pattern: [### Title ... ](actual-url)
    const blockRegex =
      /\[###\s+(.+?)\s+(?:!\[Image[^\]]*\]\([^)]*\)\s*)?[^\]]*\]\((https?:\/\/[^\s)]+)\)/g;

    let match;
    while ((match = blockRegex.exec(text)) !== null && results.length < limit) {
      const rawTitle = match[1].trim();
      const actualUrl = match[2].replace(/#.*$/, "").replace(/\/$/, "");
      // Clean title — remove image refs and source names embedded in it
      const title = rawTitle
        .replace(/!\[Image[^\]]*\]\([^)]*\)/g, "")
        .replace(/\s+(Wikipedia|Encyclopedia Britannica|BBC|Biography|World History Encyclopedia|Library of Congress.*|AlexanderPalace.*|International Encyclopedia.*)$/i, "")
        .trim();

      try {
        const parsed = new URL(actualUrl);
        const host = parsed.hostname.replace("www.", "");

        // Skip Google, Facebook, social media noise
        if (
          host.includes("google.com") ||
          host.includes("facebook.com") ||
          host.includes("gstatic.com") ||
          host.includes("x.com") ||
          host.includes("twitter.com") ||
          host.includes("youtube.com") ||
          host.includes("localhost")
        )
          continue;

        if (seen.has(host + parsed.pathname)) continue;
        seen.add(host + parsed.pathname);

        // Get snippet — text after the result block
        const afterIdx = match.index + match[0].length;
        const afterText = text.substring(afterIdx, afterIdx + 1200);
        // Remove all markdown links, images, and URL fragments
        const cleanedAfter = afterText
          .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // [text](url) -> text
          .replace(/!\[[^\]]*\]\([^)]*\)/g, "")     // ![alt](url) -> ""
          .replace(/https?:\/\/[^\s)]+/g, "")        // bare URLs
          .replace(/\*\*/g, "")
          .replace(/_/g, "")
          .replace(/<[^>]+>/g, "")
          .replace(/Read\s*more\s*(###)?/gi, "")
          .replace(/\s+/g, " ");
        // Split on sentence-like boundaries and find real text
        const sentences = cleanedAfter
          .split(/(?<=[.!?])\s+/)
          .map((s) => s.trim())
          .filter(
            (s) =>
              s.length > 40 &&
              !/^[\[\#\*\!]/.test(s) &&
              !/^(more|Translate|Feedback)\b/i.test(s) &&
              !s.includes("›") &&
              !/^\w+\.\w+\s/.test(s) &&
              (s.match(/\s/g) || []).length >= 4
          );
        const snippet = sentences.length > 0
          ? sentences[0].replace(/^[\s—–-]+/, "").substring(0, 200)
          : "";

        if (title.length >= 5) {
          results.push({ title, url: actualUrl, snippet, source: host });
        }
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
