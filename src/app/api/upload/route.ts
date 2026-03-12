import { NextRequest, NextResponse } from "next/server";
import { parseDocument } from "@/lib/parsers";
import { storeDocument } from "@/lib/store";
import { generateReport, extractSearchQueries } from "@/lib/groq";
import { searchForTopics } from "@/lib/search";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const id = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const parsed = await parseDocument(buffer, file.name, file.type);

    if (!parsed.text.trim()) {
      return NextResponse.json(
        { error: "Could not extract text from the document. The file may be empty or in an unsupported format." },
        { status: 400 }
      );
    }

    const doc = storeDocument(id, parsed);

    // Step 1: Extract search queries
    const queries = await extractSearchQueries(parsed.text, file.name);

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
    const report = await generateReport(parsed.text, file.name, searchData.images);

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
