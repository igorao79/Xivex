import { NextRequest, NextResponse } from "next/server";
import groq from "@/lib/groq";

interface QA {
  question: string;
  answer: string;
}

const SYSTEM_PROMPT = `You are an expert prompt engineer. The user wants to create an AI prompt for a specific task.

Your job: ask clarifying questions to gather info for building a perfect prompt.

## FIRST ROUND — MANDATORY QUESTIONS:
You MUST always return 3-6 questions. NEVER return "done": true.

### For CODE/PROGRAMMING tasks (calculator, app, script, bot, etc.):
1. FIRST question MUST be: what programming language / tech stack? (JS, Python, C++, web, mobile, etc.)
2. What platform/environment? (browser, Node.js, desktop, mobile)
3. What specific features/functionality?
4. Any design/UI requirements?
5. Error handling requirements?
6. Testing requirements?

### For WRITING tasks:
1. Target audience?
2. Tone and style?
3. Length and format?

### For ANALYSIS tasks:
1. Data format?
2. Expected output?
3. Depth of analysis?

## ABSOLUTE RULES:
- NEVER assume ANY technology, language, or framework. ALWAYS ASK.
- "create a calculator" → you MUST ask "what language?" — it could be Python, JS, C++, Rust, web app, mobile, etc.
- ALWAYS return "done": false on every round
- 3-6 questions per round
- Each question = 1 SHORT sentence
- Questions SPECIFIC to the task
- Respond in SAME language as user's request
- Output ONLY valid JSON: { "questions": ["q1", "q2", ...], "done": false }
- NEVER output "done": true. The client decides when to stop.`;

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
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        const match = text.match(/\{[\s\S]*\}/);
        if (match) parsed = JSON.parse(match[0]);
        else throw new Error("No JSON found");
      }

      const questions = Array.isArray(parsed.questions) ? parsed.questions : [];
      // Always return done:false — the client controls when to generate
      return NextResponse.json({
        questions,
        done: false,
      });
    } catch {
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
