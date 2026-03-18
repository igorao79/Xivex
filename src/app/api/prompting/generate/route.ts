import { NextRequest } from "next/server";
import groq from "@/lib/groq";

interface QA {
  question: string;
  answer: string;
}

const SYSTEM_PROMPT = `You are a world-class prompt engineer (2026 best practices). Create a production-ready AI prompt based on the user's requirements.

## PROMPT STRUCTURE (follow strictly):

### 1. System Message (## Role)
One clear sentence defining who the AI is. Be specific: "You are a senior React developer with 10 years of experience" > "You are a developer".

### 2. Task (## Task)
Concise, actionable instruction. Use imperative verbs. Break complex tasks into numbered steps (chain-of-thought). Each step should be specific and testable.

### 3. Context & Constraints (## Context)
Only include what's necessary. Mention: target platform, tech stack, key requirements, what to AVOID. Use bullet points.

### 4. Output Format (## Output Format)
Specify EXACTLY what the output should look like. If code — mention file structure, naming conventions. If text — mention length, format, sections.

### 5. Examples (## Examples) — CRITICAL
Include 1-2 concrete input→output examples. For code tasks, show a small snippet of the expected style/pattern. Few-shot examples dramatically improve results.

### 6. Edge Cases & Rules (## Rules)
Bullet list of DO and DON'T. Handle error cases explicitly.

## QUALITY RULES:
- Write in the SAME LANGUAGE as the user's original request
- Be CONCISE — sweet spot is 150-300 words. Every sentence must add value
- NO filler text, NO obvious statements ("the code should work correctly")
- Use markdown: ## headers, **bold** for key terms, \`code\` for technical terms, bullet lists
- Include concrete technical details from the user's answers (specific libraries, versions, patterns)
- The prompt must be SELF-CONTAINED — copy-paste ready for any AI
- DO NOT wrap the output in a code block
- Start with: # [Short descriptive title]
- DO NOT include sections that add no value (e.g. empty "Tone" sections for technical tasks)
- For coding tasks: specify file structure, tech stack, and include a code example of the expected style`;

function sseEvent(data: string): string {
  return `data: ${data}\n\n`;
}

export async function POST(request: NextRequest) {
  try {
    const { request: userRequest, answers } = await request.json();

    if (!userRequest) {
      return new Response(JSON.stringify({ error: "Request required" }), {
        status: 400,
      });
    }

    let userContent = `Original request: "${userRequest}"`;

    if (answers && answers.length > 0) {
      userContent += "\n\nClarification answers:\n";
      answers.forEach((qa: QA, i: number) => {
        userContent += `Q: ${qa.question}\nA: ${qa.answer}\n\n`;
      });
    }

    userContent +=
      "\nNow create a professional, production-ready prompt based on all the information above.";

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const response = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: userContent },
            ],
            stream: true,
            temperature: 0.4,
            max_tokens: 4096,
          });

          for await (const chunk of response) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (content) {
              controller.enqueue(
                encoder.encode(
                  sseEvent(JSON.stringify({ content }))
                )
              );
            }
          }

          controller.enqueue(encoder.encode(sseEvent("[DONE]")));
          controller.close();
        } catch (error) {
          console.error("Generate stream error:", error);
          controller.enqueue(
            encoder.encode(
              sseEvent(
                JSON.stringify({
                  content: "\n\nError generating prompt. Please try again.",
                })
              )
            )
          );
          controller.enqueue(encoder.encode(sseEvent("[DONE]")));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Generate error:", error);
    return new Response(JSON.stringify({ error: "Failed to generate prompt" }), {
      status: 500,
    });
  }
}
