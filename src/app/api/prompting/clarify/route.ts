import { NextRequest, NextResponse } from "next/server";
import groq from "@/lib/groq";

interface QA {
  question: string;
  answer: string;
}

const SYSTEM_PROMPT = `You are an expert prompt engineer. The user wants to create an AI prompt for a specific task.

Your job is to ask 3-5 SHORT, SPECIFIC questions that will make the difference between a mediocre and an excellent prompt.

ASK ABOUT THINGS THAT MATTER:
- For CODE tasks: tech stack, framework version, file structure preference, testing requirements
- For WRITING tasks: target audience, tone, length, format (blog/docs/email)
- For ANALYSIS tasks: data format, expected output, depth of analysis
- For DESIGN tasks: platform, style reference, responsive requirements
- ALWAYS ask: "What should the output look like? Give an example if possible."

DO NOT ask generic questions like "What tone?" for a coding task. Be smart about what matters for THIS specific request.

Rules:
- 3-5 questions MAX per round
- Each question = 1 SHORT sentence
- Questions must be SPECIFIC to the task (not generic templates)
- If the user provided a lot of detail already, ask fewer questions
- Respond in the SAME language as the user's request
- Output ONLY: { "questions": ["q1", "q2", ...], "done": false }
- Set "done": true if you already have enough info (rare on first round)`;

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
