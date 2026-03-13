import { NextRequest, NextResponse } from "next/server";
import { storeDocument } from "@/lib/store";
import { generateReport, extractSearchQueries } from "@/lib/groq";
import { searchForTopics } from "@/lib/search";
import type { ParsedDocument } from "@/lib/parsers";

export const maxDuration = 60;

/**
 * Accepts pre-parsed text from client-side parsing.
 * This avoids Vercel's 4.5MB request body limit for file uploads.
 */
export async function POST(request: NextRequest) {
  try {
    const { text, fileName, fileType, fileSize, pageCount } = await request.json();

    if (!text || !text.trim()) {
      return NextResponse.json(
        { error: "Could not extract text from the document. The file may be empty or in an unsupported format." },
        { status: 400 }
      );
    }

    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const id = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const parsed: ParsedDocument = {
      text,
      metadata: {
        fileName: fileName || "document",
        fileType: fileType || "txt",
        fileSize: fileSize || 0,
        pageCount,
        wordCount,
      },
    };

    const doc = storeDocument(id, parsed);

    // Step 1: Extract search queries
    const queries = await extractSearchQueries(parsed.text, fileName);

    // Step 2: Search for articles and images
    let searchData = { articles: [] as any[], images: [] as any[] };
    if (queries.length > 0) {
      try {
        searchData = await searchForTopics(queries);
      } catch (err) {
        console.error("Search error (non-critical):", err);
      }
    }

    // Step 3: Generate report with images embedded inline
    const report = await generateReport(parsed.text, fileName, searchData.images);

    return NextResponse.json({
      id: doc.id,
      metadata: doc.parsed.metadata,
      chunksCount: doc.chunks.length,
      report,
      articles: searchData.articles,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Failed to process document" },
      { status: 500 }
    );
  }
}
