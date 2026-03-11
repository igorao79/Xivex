import { NextRequest, NextResponse } from "next/server";
import groq from "@/lib/groq";
import { getDocument } from "@/lib/store";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const { documentId, query } = await request.json();

    const doc = getDocument(documentId);
    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const systemPrompt = `You are a research assistant. Based on the following document, answer the user's analytical query.
Provide related web resources and suggest images/diagrams that could help illustrate the answer.

Format your response in Markdown with:
- Clear section headings
- Bullet points for key findings
- A "Related Resources" section with suggested search terms
- A "Visual Aids" section describing relevant diagrams or images

Document text:
${doc.parsed.text.slice(0, 25000)}`;

    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: query },
      ],
      temperature: 0.3,
      max_tokens: 4096,
    });

    return NextResponse.json({
      analysis: response.choices[0]?.message?.content || "No analysis generated.",
    });
  } catch (error) {
    console.error("Analysis error:", error);
    return NextResponse.json(
      { error: "Failed to analyze document" },
      { status: 500 }
    );
  }
}
