import { NextRequest, NextResponse } from "next/server";
import groq from "@/lib/groq";

interface QA {
  question: string;
  answer: string;
}

const SYSTEM_PROMPT = `You are an expert prompt engineer. The user wants to create an AI prompt for a specific task.

Your job is to analyze their request and ask 3-5 SHORT, specific clarifying questions to gather the information needed to build a professional prompt.

Focus on:
- Target audience / end user
- Specific technologies, tools, or constraints
- Desired output format and style
- Tone and level of detail
- Edge cases or specific requirements
- Examples of expected behavior

Rules:
- Ask 3-5 questions maximum per round
- Questions should be SHORT (1 sentence each)
- Questions should be specific, not generic
- If the user already provided detailed info, ask fewer questions
- Respond in the SAME language as the user's request
- Output ONLY a JSON object: { "questions": ["q1", "q2", ...], "done": false }
- Set "done": true ONLY if you already have enough info from the request + previous answers to build an excellent prompt (this is rare on first round)`;

export async function POST(request: NextRequest) {
  try {
    const { request: userRequest, previousAnswers } = await request.json();

    if (!userRequest) {
      return NextResponse.json({ error: "Request required" }, { status: 400 });
    }

    let userContent = `Task request: "${userRequest}"`;

    if (previousAnswers && previousAnswers.length > 0) {
      userContent += "\n\nPrevious Q&A:\n";
      previousAnswers.forEach((qa: QA, i: number) => {
        userContent += `Q${i + 1}: ${qa.question}\nA${i + 1}: ${qa.answer}\n`;
      });
      userContent +=
        "\nBased on this info, do you have enough to build a great prompt? If yes, return done:true. If not, ask 2-3 more focused questions.";
    }

    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      temperature: 0.4,
      max_tokens: 500,
      response_format: { type: "json_object" },
    });

    const text = response.choices[0]?.message?.content?.trim() || "";

    try {
      const parsed = JSON.parse(text);
      return NextResponse.json({
        questions: parsed.questions || [],
        done: !!parsed.done,
      });
    } catch {
      // Fallback: try to extract from text
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        return NextResponse.json({
          questions: parsed.questions || [],
          done: !!parsed.done,
        });
      }
      throw new Error("Failed to parse AI response");
    }
  } catch (error) {
    console.error("Clarify error:", error);
    return NextResponse.json(
      { error: "Failed to generate questions" },
      { status: 500 }
    );
  }
}
