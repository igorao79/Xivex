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

interface ImageForReport {
  title: string;
  url: string;
  image: string;
  thumbnail: string;
}

export async function generateReport(
  documentText: string,
  fileName: string,
  images: ImageForReport[] = []
) {
  const imageBlock =
    images.length > 0
      ? `

IMAGES — you have these images available. You may embed them INSIDE the text ONLY if they are DIRECTLY relevant to the content being discussed:
${images.map((img, i) => `  img${i + 1}: "${img.title}" → ![Рис. ${i + 1} — ${img.title}](${img.image})`).join("\n")}

Rules for images:
- Use an image ONLY if its title clearly relates to a topic discussed in the document (people, places, events, objects, diagrams, maps, scientific concepts, artworks, etc.)
- Do NOT use generic/decorative images: plain book covers, category icons, flags, logos, stock photos, or images whose title is just a broad category (e.g. "Subjects: History")
- It is perfectly fine to use ZERO images if none are relevant to the document's content
- NEVER group images together. NEVER create an "Images" / "Illustrations" / "Gallery" section
- Place each image between paragraphs where its subject is discussed
- Maximum 3 images`
      : "";

  const systemPrompt = `You are an expert document analyst. Produce a thorough, well-structured analysis report in Markdown.

Write the report in the SAME LANGUAGE as the document. Structure it naturally — use headings (##) that fit the document's content. Do NOT follow a rigid template. Organise the report the way a skilled analyst would: start with a brief overview, then cover key topics, insights, data, and context in whatever order makes sense.

Guidelines:
- Use ## headings, bullet points, **bold**, tables where appropriate
- Quote specific parts of the document to support your points
- Include any numbers, statistics, or data in tables
- Be thorough but concise — no filler
- At the very END, add a section "## Potential Questions" with 5 numbered thought-provoking questions
- Do NOT use generic section names like "Executive Summary" or "Key Findings" — write descriptive headings that reflect the actual content${imageBlock}`;

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
        content: `You extract Wikipedia/image search queries from documents. Given a document, return 4-6 very SPECIFIC search queries.

CRITICAL RULES:
- ALWAYS write queries in ENGLISH, even if the document is in another language
- Queries must be EXTREMELY SPECIFIC — use FULL proper names, not abbreviations
  BAD: "Nicholas II" (matches many people named Nicholas)
  GOOD: "Nicholas II of Russia", "Tsar Nicholas II Romanov"
  BAD: "World War I"
  GOOD: "World War I Eastern Front Russia"
- Each query should target a DIFFERENT key topic from the document
- Keep queries 3-8 words, but always include disambiguating context
- For people: always add their role/country/era (e.g. "Alexander II Emperor Russia")
- For events: always add location/year/context (e.g. "Russian Revolution 1917 Petrograd")
- For places: always add country/region (e.g. "Winter Palace St Petersburg")
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
