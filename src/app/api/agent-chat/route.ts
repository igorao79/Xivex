import { NextRequest } from "next/server";
import groq from "@/lib/groq";
import { searchGoogle, extractPageContent } from "@/lib/search";

export const maxDuration = 60;

const AGENT_MODEL = "llama-3.3-70b-versatile";
const VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
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
            description: "Search query — ALWAYS write in English for best results, even if the user's message is in another language. Translate the user's intent to English.",
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

const SYSTEM_PROMPT = `You are Xivex AI — a multilingual research assistant with real-time web search.
Today's date: ${new Date().toISOString().split("T")[0]}.

CRITICAL WORKFLOW — you MUST follow this for EVERY question:
1. SEARCH first: For ANY question, use web_search to find relevant results.
2. READ pages: After searching, you MUST use read_page on 2-3 of the most relevant URLs to get ACTUAL content. NEVER just list search result titles — that is useless to the user. If read_page returns an error, try another URL from the search results.
3. SYNTHESIZE: After reading pages, write a detailed answer with SPECIFIC facts, numbers, names, dates from the pages you read. Include concrete details — headlines, statistics, quotes.

RULES:
- NEVER just list website names like "visit BBC, CNN, Reuters". The user wants YOU to read those sites and tell them the actual news.
- NEVER say "you can visit these websites for more info" — that defeats the purpose. READ the pages yourself and summarize.
- NEVER say "as of my last update" or reference old dates. You have real-time search — USE IT.
- Always respond in the SAME LANGUAGE as the user's message.
- Always cite sources with [Title](URL) markdown links inline.
- Use rich Markdown: ## headings, **bold**, bullet points, tables when appropriate.
- When searching, prefer English queries for best results, but ALWAYS respond in the user's language.
- For simple factual questions (math, definitions) you may answer directly without searching.`;

/** Strip HTML tags and extract readable text */
function htmlToText(html: string): string {
  // Remove script, style, nav, footer, header elements
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<aside[\s\S]*?<\/aside>/gi, "");
  // Replace block elements with newlines
  text = text.replace(/<\/?(p|div|br|h[1-6]|li|tr|td|th|blockquote|section|article)[^>]*>/gi, "\n");
  // Remove remaining tags
  text = text.replace(/<[^>]+>/g, " ");
  // Decode HTML entities
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  // Clean whitespace
  text = text.replace(/[ \t]+/g, " ").replace(/\n\s*\n/g, "\n\n").trim();
  return text;
}

/** Fetch a page's text content */
async function readPage(url: string): Promise<string> {
  // Strategy 1: Tavily Extract — best quality
  try {
    const results = await extractPageContent([url]);
    if (results[0] && results[0].length > 200 && !results[0].startsWith("Error:")) {
      return results[0];
    }
  } catch {}

  // Strategy 2: Jina Reader
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: { Accept: "text/plain", "X-Return-Format": "text", "X-No-Cache": "true" },
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      const text = await res.text();
      if (text.length > 200) return text.slice(0, 10000);
    }
  } catch {}

  // Strategy 3: Direct fetch + HTML stripping
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html,*/*",
      },
      signal: AbortSignal.timeout(10000),
      redirect: "follow",
    });
    if (res.ok) {
      const html = await res.text();
      const text = htmlToText(html);
      if (text.length > 200) return text.slice(0, 10000);
    }
  } catch {}

  return "Error: Could not read page. Try a different URL.";
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

    // Detect if any message has image content (multimodal)
    const hasImages = clientMessages.some(
      (m: any) =>
        Array.isArray(m.content) &&
        m.content.some((c: any) => c.type === "image_url")
    );

    const model = hasImages ? VISION_MODEL : AGENT_MODEL;

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
          const collectedSources: { title: string; url: string }[] = [];

          // Tool-calling loop
          while (iterations < MAX_TOOL_ITERATIONS) {
            iterations++;

            // Non-streaming call with tools
            // Vision model doesn't support tools, so skip them for image queries
            const response = await groq.chat.completions.create({
              model,
              messages,
              ...(hasImages ? {} : { tools, tool_choice: "auto" as const }),
              temperature: 0.3,
              max_tokens: 4096,
            });

            const choice = response.choices[0];
            const assistantMsg = choice.message;

            const hasToolCalls = assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0;

            if (hasToolCalls) {
              // Append assistant message with tool calls
              messages.push(assistantMsg);

              // Execute each tool call
              for (const toolCall of assistantMsg.tool_calls!) {
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

                // Collect sources from web_search results
                if (fnName === "web_search") {
                  try {
                    const searchResults = JSON.parse(result);
                    if (Array.isArray(searchResults)) {
                      for (const r of searchResults) {
                        if (r.title && r.url && !collectedSources.some((s) => s.url === r.url)) {
                          collectedSources.push({ title: r.title, url: r.url });
                        }
                      }
                    }
                  } catch {}
                }

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

            // Send collected sources before final answer
            if (collectedSources.length > 0) {
              controller.enqueue(
                encoder.encode(
                  sseEvent(JSON.stringify({ sources: collectedSources }))
                )
              );
            }

            // Final text response — if we already have content, send it;
            // otherwise do a streaming call for the final answer
            if (assistantMsg.content) {
              // Model responded with text directly (no tools needed)
              // Stream it back in chunks for smoother UX
              const text = assistantMsg.content;
              const chunkSize = 4;
              for (let i = 0; i < text.length; i += chunkSize) {
                controller.enqueue(
                  encoder.encode(
                    sseEvent(JSON.stringify({ content: text.slice(i, i + chunkSize) }))
                  )
                );
              }
            } else {
              // After tool calls, do a streaming call for the final answer
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
