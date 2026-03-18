import { NextRequest, NextResponse } from "next/server";
import groq from "@/lib/groq";
import { searchGoogle } from "@/lib/search";

export async function GET(request: NextRequest) {
  const locale = request.nextUrl.searchParams.get("locale") || "ru";

  try {
    // Fetch trending topics from diverse sources
    const results = await searchGoogle("trending news today world science technology culture sports", 10);
    const context = results
      .map((r) => `${r.title}: ${r.snippet}`)
      .join("\n")
      .slice(0, 2000);

    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: `Based on the trending topics below, generate exactly 4 short interesting questions (max 6-8 words each) that a user might want to ask an AI assistant.

IMPORTANT RULES:
- Questions MUST be diverse — each question on a DIFFERENT topic (e.g. one about world news, one about science, one about culture/lifestyle, one about tech)
- Do NOT make all questions about AI or technology
- Questions should feel fresh and topical, based on what's trending right now
- Output ONLY a JSON array of 4 strings, nothing else
- Language: ${locale === "ru" ? "Russian" : "English"}`,
        },
        {
          role: "user",
          content: `Today's trending topics:\n${context}`,
        },
      ],
      temperature: 0.9,
      max_tokens: 200,
    });

    const text = response.choices[0]?.message?.content?.trim() || "";

    // Parse JSON array from response
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      const questions = JSON.parse(match[0]);
      if (Array.isArray(questions) && questions.length >= 4) {
        return NextResponse.json(
          { questions: questions.slice(0, 4) },
          { headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600" } }
        );
      }
    }

    throw new Error("Invalid response format");
  } catch (error) {
    console.error("Suggestions error:", error);
    // Fallback static questions
    const fallback =
      locale === "ru"
        ? [
            "Что происходит в мире сегодня?",
            "Какие научные открытия были недавно?",
            "Посоветуй фильм для вечера",
            "Как улучшить продуктивность?",
          ]
        : [
            "What's happening in the world today?",
            "What recent scientific discoveries were made?",
            "Recommend a movie for tonight",
            "How to improve productivity?",
          ];

    return NextResponse.json({ questions: fallback });
  }
}
