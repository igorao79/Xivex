import { NextRequest, NextResponse } from "next/server";
import groq from "@/lib/groq";
import { searchGoogle } from "@/lib/search";

export async function GET(request: NextRequest) {
  const locale = request.nextUrl.searchParams.get("locale") || "ru";

  try {
    // Fetch trending topics from web
    const results = await searchGoogle("trending topics today technology AI 2026", 8);
    const context = results
      .map((r) => `${r.title}: ${r.snippet}`)
      .join("\n")
      .slice(0, 2000);

    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: `Based on the trending topics below, generate exactly 4 short interesting questions (max 6-8 words each) that a user might want to ask an AI assistant. Questions should be diverse: mix tech, science, world events, and practical topics. Output ONLY a JSON array of 4 strings, nothing else. Language: ${locale === "ru" ? "Russian" : "English"}.`,
        },
        {
          role: "user",
          content: `Trending topics:\n${context}`,
        },
      ],
      temperature: 0.8,
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
            "Какие последние новости в мире технологий?",
            "Сравни React и Vue в 2026 году",
            "Объясни квантовые вычисления простыми словами",
            "Какие тренды в AI сейчас?",
          ]
        : [
            "What are the latest tech news?",
            "Compare React vs Vue in 2026",
            "Explain quantum computing in simple terms",
            "What are the current AI trends?",
          ];

    return NextResponse.json({ questions: fallback });
  }
}
