import { NextRequest, NextResponse } from "next/server";
import { parseDocument } from "@/lib/parsers";
import { storeDocument } from "@/lib/store";
import { generateReport } from "@/lib/groq";

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

    // Generate initial report
    const report = await generateReport(parsed.text, file.name);

    return NextResponse.json({
      id: doc.id,
      metadata: doc.parsed.metadata,
      chunksCount: doc.chunks.length,
      report,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Failed to process document" },
      { status: 500 }
    );
  }
}
