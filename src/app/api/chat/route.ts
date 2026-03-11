import { NextRequest } from "next/server";
import groq from "@/lib/groq";
import { searchChunks, getDocument, getAllDocuments } from "@/lib/store";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const { messages, documentId } = await request.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "Invalid messages" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const lastUserMessage = [...messages].reverse().find((m: { role: string }) => m.role === "user")?.content || "";

    // RAG: find relevant chunks
    const relevantChunks = searchChunks(lastUserMessage, documentId);
    const context = relevantChunks.map((c) => c.text).join("\n\n---\n\n");

    // Get document info
    const doc = documentId ? getDocument(documentId) : getAllDocuments()[0];
    const docName = doc?.parsed.metadata.fileName || "uploaded document";

    const systemMessage = `You are a helpful AI research assistant, similar to Perplexity AI. You analyze documents and provide well-sourced, comprehensive answers.

You are currently helping the user with the document "${docName}".

Here are the most relevant sections from the document:

<context>
${context}
</context>

Rules:
- Answer based on the document context provided above
- If the information is not in the context, say so clearly
- Use Markdown formatting: headings, bullet points, bold text, code blocks, tables
- Cite specific parts of the document when possible
- If the user asks for general knowledge beyond the document, provide it but clearly distinguish it from document content
- Suggest follow-up questions the user might find useful
- Be concise but thorough`;

    const allMessages = [
      { role: "system" as const, content: systemMessage },
      ...messages.map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    const stream = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: allMessages,
      stream: true,
      temperature: 0.3,
      max_tokens: 4096,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (content) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Chat error:", error);
    return new Response(JSON.stringify({ error: "Failed to process chat" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
