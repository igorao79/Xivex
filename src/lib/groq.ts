import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export default groq;

const MODEL = "openai/gpt-oss-120b";

export async function streamChat(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  onChunk: (text: string) => void
) {
  const stream = await groq.chat.completions.create({
    model: MODEL,
    messages,
    stream: true,
    temperature: 0.3,
    max_tokens: 4096,
  });

  let fullResponse = "";
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || "";
    if (content) {
      fullResponse += content;
      onChunk(content);
    }
  }
  return fullResponse;
}

export async function generateReport(documentText: string, fileName: string) {
  const systemPrompt = `You are an expert document analyst. You will be given the full text of a document.
Your task is to produce a comprehensive, well-structured analysis report in Markdown format.

The report MUST include these sections:

## Executive Summary
A brief overview of the document.

## Key Findings
Main points, data, and insights as bullet points.

## Detailed Analysis
Section-by-section breakdown with supporting quotes from the document.

## Statistics & Data
Any numbers, percentages, or data points. Use Markdown tables where appropriate.

## Potential Questions
List 5 thought-provoking questions a reader might have after reading. Format as a numbered list.

Use proper Markdown formatting with headings, bullet points, bold text, and tables where appropriate.
Be thorough but concise. Always reference specific parts of the document.`;

  const response = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Analyze this document "${fileName}":\n\n${documentText.slice(0, 30000)}`,
      },
    ],
    temperature: 0.3,
    max_tokens: 8192,
  });

  return response.choices[0]?.message?.content || "Unable to generate report.";
}

/**
 * Extract search queries from document text for finding related articles and images
 */
export async function extractSearchQueries(
  documentText: string,
  fileName: string
): Promise<string[]> {
  // Use smaller model for query extraction to avoid rate limits
  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: `You extract search queries from documents. Given a document, return 4-6 diverse search queries that would find relevant articles, images, and resources about the document's topics.

Rules:
- ALWAYS write queries in ENGLISH, even if the document is in another language
- Each query should target a DIFFERENT aspect of the document
- Make queries specific enough to get good results but SHORT (3-8 words each)
- Include the main subject/topic in most queries
- Include queries for both broad context and specific details
- Return ONLY the queries, one per line, no numbering, no extra text`,
      },
      {
        role: "user",
        content: `Extract search queries for "${fileName}":\n\n${documentText.slice(0, 3000)}`,
      },
    ],
    temperature: 0.3,
    max_tokens: 256,
  });

  const text = response.choices[0]?.message?.content || "";
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 3 && line.length < 150);
}
