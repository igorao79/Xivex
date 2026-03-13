import { NextRequest } from "next/server";
import groq from "@/lib/groq";
import { searchGoogle } from "@/lib/search";

export const maxDuration = 60;

const AGENT_MODEL = "llama-3.3-70b-versatile";
const MAX_TOOL_ITERATIONS = 5;

const tools: any[] = [
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the web for current information. Use this when you need up-to-date facts, news, prices, comparisons, or anything you're not sure about.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query in English for best results",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_page",
      description:
        "Read the full text content of a web page. Use this after web_search to get detailed information from a specific URL.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "Full URL to read" },
        },
        required: ["url"],
      },
    },
  },
];

const SYSTEM_PROMPT = `You are Xivex AI — a helpful research assistant with web search capabilities.

You can use tools to search the web and read pages to answer questions accurately.

Guidelines:
- Search the web when you need current information, facts, or data
- After searching, read specific pages to get detailed content
- Always cite your sources with [Title](URL) markdown links
- Use Markdown formatting: headings, bullet points, bold, tables
- Answer in the same language as the user's question
- Be thorough but concise — no filler
- If you already know the answer with certainty, you can respond directly without searching`;

/** Fetch a page's text content via Jina Reader */
async function readPage(url: string): Promise<string> {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: { Accept: "text/plain" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return `Error: Could not read page (${res.status})`;
    const text = await res.text();
    return text.slice(0, 8000);
  } catch {
    return "Error: Page read timed out or failed";
  }
}

/** Execute a tool call and return the result */
async function executeTool(
  name: string,
  args: Record<string, string>
): Promise<string> {
  switch (name) {
    case "web_search": {
      const results = await searchGoogle(args.query, 6);
      if (results.length === 0) return "No results found.";
      return JSON.stringify(
        results.map((r) => ({
          title: r.title,
          url: r.url,
          snippet: r.snippet,
        }))
      );
    }
    case "read_page": {
      return readPage(args.url);
    }
    default:
      return `Unknown tool: ${name}`;
  }
}

/** Helper to send an SSE event */
function sseEvent(data: string): string {
  return `data: ${data}\n\n`;
}

export async function POST(request: NextRequest) {
  try {
    const { messages: clientMessages } = await request.json();

    if (!clientMessages || !Array.isArray(clientMessages)) {
      return new Response(JSON.stringify({ error: "Invalid messages" }), {
        status: 400,
      });
    }

    // Build messages array with system prompt
    const messages: any[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...clientMessages,
    ];

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          let iterations = 0;

          // Tool-calling loop
          while (iterations < MAX_TOOL_ITERATIONS) {
            iterations++;

            // Non-streaming call with tools
            const response = await groq.chat.completions.create({
              model: AGENT_MODEL,
              messages,
              tools,
              tool_choice: "auto",
              temperature: 0.3,
              max_tokens: 4096,
            });

            const choice = response.choices[0];
            const assistantMsg = choice.message;

            if (choice.finish_reason === "tool_calls" && assistantMsg.tool_calls) {
              // Append assistant message with tool calls
              messages.push(assistantMsg);

              // Execute each tool call
              for (const toolCall of assistantMsg.tool_calls) {
                const fnName = toolCall.function.name;
                let args: Record<string, string> = {};
                try {
                  args = JSON.parse(toolCall.function.arguments);
                } catch {
                  args = {};
                }

                // Send status event
                if (fnName === "web_search") {
                  controller.enqueue(
                    encoder.encode(
                      sseEvent(
                        JSON.stringify({
                          tool_status: "searching",
                          query: args.query || "",
                        })
                      )
                    )
                  );
                } else if (fnName === "read_page") {
                  controller.enqueue(
                    encoder.encode(
                      sseEvent(
                        JSON.stringify({
                          tool_status: "reading",
                          url: args.url || "",
                        })
                      )
                    )
                  );
                }

                // Execute tool
                const result = await executeTool(fnName, args);

                // Append tool result
                messages.push({
                  role: "tool",
                  tool_call_id: toolCall.id,
                  content: result,
                });
              }

              // Continue loop for next LLM call
              continue;
            }

            // Final text response — stream it
            const finalStream = await groq.chat.completions.create({
              model: AGENT_MODEL,
              messages,
              stream: true,
              temperature: 0.3,
              max_tokens: 4096,
            });

            for await (const chunk of finalStream) {
              const content = chunk.choices[0]?.delta?.content || "";
              if (content) {
                controller.enqueue(
                  encoder.encode(
                    sseEvent(JSON.stringify({ content }))
                  )
                );
              }
            }

            break; // Done
          }

          controller.enqueue(encoder.encode(sseEvent("[DONE]")));
          controller.close();
        } catch (error) {
          console.error("Agent chat error:", error);
          controller.enqueue(
            encoder.encode(
              sseEvent(
                JSON.stringify({
                  content: "\n\nSorry, something went wrong. Please try again.",
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
    console.error("Agent chat error:", error);
    return new Response(JSON.stringify({ error: "Agent chat failed" }), {
      status: 500,
    });
  }
}
