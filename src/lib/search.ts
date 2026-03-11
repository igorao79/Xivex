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
 * Search Google via Jina Reader — parses real search result titles, URLs, and snippets
 */
async function searchGoogle(
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
 * Search Wikimedia Commons for images
 */
async function searchCommonsImages(
  query: string,
  limit = 8
): Promise<ImageResult[]> {
  try {
    const params = new URLSearchParams({
      action: "query",
      generator: "search",
      gsrsearch: query,
      gsrnamespace: "6",
      gsrlimit: String(limit),
      prop: "imageinfo",
      iiprop: "url|extmetadata",
      iiurlwidth: "500",
      format: "json",
    });

    const res = await fetch(
      `https://commons.wikimedia.org/w/api.php?${params}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return [];

    const data = await res.json();
    const pages = Object.values(data.query?.pages || {}) as any[];
    const results: ImageResult[] = [];

    for (const page of pages) {
      const info = page.imageinfo?.[0];
      if (!info?.thumburl) continue;

      const title = (page.title || "").toLowerCase();
      if (title.endsWith(".svg") || title.includes("icon") || title.includes("logo") || title.includes("flag"))
        continue;
      // Skip very generic images (single word titles after removing File: prefix)
      const cleanTitle = title.replace("file:", "").replace(/\.[^.]+$/, "").trim();
      if (cleanTitle.split(/\s+/).length <= 1) continue;

      const desc =
        info.extmetadata?.ImageDescription?.value
          ?.replace(/<[^>]+>/g, "")
          ?.substring(0, 120) || page.title.replace("File:", "").replace(/\.[^.]+$/, "");

      results.push({
        title: desc,
        url:
          info.descriptionurl ||
          `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`,
        image: info.thumburl,
        thumbnail: info.thumburl,
      });
    }

    return results;
  } catch {
    return [];
  }
}

/**
 * Search Wikipedia for pages and get their thumbnails
 */
async function getWikiPageImages(queries: string[]): Promise<ImageResult[]> {
  const results: ImageResult[] = [];

  for (const query of queries.slice(0, 3)) {
    try {
      const searchParams = new URLSearchParams({
        action: "query",
        generator: "search",
        gsrsearch: query,
        gsrlimit: "3",
        prop: "pageimages",
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
        if (p.thumbnail?.source) {
          results.push({
            title: p.title,
            url: `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, "_"))}`,
            image: p.thumbnail.source,
            thumbnail: p.thumbnail.source,
          });
        }
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
    // Wikimedia Commons — focused search on main topic
    searchCommonsImages(queries[0]?.split(/\s+/).slice(0, 3).join(" ") || "", 10),
    // Wikipedia page images via search
    getWikiPageImages(queries.slice(0, 4)),
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
    images: Array.from(uniqueImages.values()).slice(0, 8),
  };
}
