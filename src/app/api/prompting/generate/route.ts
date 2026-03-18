import { NextRequest } from "next/server";
import groq from "@/lib/groq";

interface QA {
  question: string;
  answer: string;
}

const SYSTEM_PROMPT = `You are a world-class prompt engineer. Your task is to create a professional, production-ready AI prompt based on the user's requirements and their answers to clarifying questions.

BUILD THE PROMPT FOLLOWING THESE BEST PRACTICES:

1. **Role Definition** — Start with a clear role/persona for the AI
2. **Context & Background** — Provide relevant context the AI needs
3. **Task Description** — Clear, specific instructions on what to do
4. **Requirements & Constraints** — Rules, limitations, what to avoid
5. **Output Format** — Specify the exact format expected
6. **Examples** — Include 1-2 examples if helpful
7. **Edge Cases** — Handle special scenarios
8. **Tone & Style** — Define communication style

RULES:
- Write the prompt in the SAME LANGUAGE as the user's original request
- The prompt should be ready to copy-paste into any AI assistant
- Use markdown formatting: headers (##), bold, lists, code blocks
- Be thorough but not verbose — every sentence should add value
- The prompt should be self-contained (no external references needed)
- DO NOT wrap the entire output in a code block — write it as plain markdown
- Start with a title line: # Prompt: [short title]`;

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
