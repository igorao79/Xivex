import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export default groq;

export async function streamChat(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  onChunk: (text: string) => void
) {
  const stream = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
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

The report MUST include:
1. **Executive Summary** — a brief overview of the document
2. **Key Findings** — main points, data, and insights from the document
3. **Detailed Analysis** — section-by-section breakdown with supporting quotes
4. **Statistics & Data** — any numbers, percentages, or data points (use tables if appropriate)
5. **Related Topics** — suggest 3-5 related topics the user might want to explore further
6. **Potential Questions** — list 5 questions a reader might have after reading

Use proper Markdown formatting with headings, bullet points, bold text, and tables where appropriate.
Be thorough but concise. Always reference specific parts of the document.`;

  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Analyze this document "${fileName}":\n\n${documentText.slice(0, 30000)}`,
      },
    ],
    temperature: 0.3,
    max_tokens: 4096,
  });

  return response.choices[0]?.message?.content || "Unable to generate report.";
}
