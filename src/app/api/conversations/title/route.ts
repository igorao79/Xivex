import { NextRequest, NextResponse } from "next/server";
import groq from "@/lib/groq";

export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Message required" }, { status: 400 });
    }

    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content:
            "Generate a very short title (2-3 words max) for a chat conversation based on the user's first message. The title should capture the main topic. Respond in the SAME language as the user's message. Output ONLY the title, nothing else. No quotes, no punctuation at the end.",
        },
        { role: "user", content: message },
      ],
      temperature: 0.3,
      max_tokens: 20,
    });

    const title = response.choices[0]?.message?.content?.trim() || message.slice(0, 30);

    return NextResponse.json({ title });
  } catch (error) {
    console.error("Title generation error:", error);
    // Fallback: truncate message
    const { message } = await request.clone().json().catch(() => ({ message: "" }));
    return NextResponse.json({
      title: typeof message === "string" ? message.slice(0, 30) : "New chat",
    });
  }
}
