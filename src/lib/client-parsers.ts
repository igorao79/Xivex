/**
 * Client-side file parsers — extract text in the browser
 * to avoid Vercel's 4.5MB request body limit.
 */
import JSZip from "jszip";
import * as XLSX from "xlsx";

export interface ClientParsedResult {
  text: string;
  pageCount?: number;
}

/** Parse PPTX — extract text from XML slides */
async function parsePptx(buffer: ArrayBuffer): Promise<ClientParsedResult> {
  const zip = await JSZip.loadAsync(buffer);
  const slides: { index: number; text: string }[] = [];

  for (const [path, file] of Object.entries(zip.files)) {
    const slideMatch = path.match(/^ppt\/slides\/slide(\d+)\.xml$/);
    if (!slideMatch) continue;

    const xml = await file.async("text");
    const textParts: string[] = [];
    const regex = /<a:t[^>]*>([\s\S]*?)<\/a:t>/g;
    let match;
    while ((match = regex.exec(xml)) !== null) {
      const t = match[1].trim();
      if (t) textParts.push(t);
    }

    if (textParts.length > 0) {
      slides.push({ index: parseInt(slideMatch[1]), text: textParts.join(" ") });
    }
  }

  slides.sort((a, b) => a.index - b.index);
  return {
    text: slides.map((s) => `--- Slide ${s.index} ---\n${s.text}`).join("\n\n"),
    pageCount: slides.length,
  };
}

/** Parse DOCX — extract text from document.xml */
async function parseDocx(buffer: ArrayBuffer): Promise<ClientParsedResult> {
  const zip = await JSZip.loadAsync(buffer);
  const docXml = zip.file("word/document.xml");
  if (!docXml) return { text: "" };

  const xml = await docXml.async("text");
  const textParts: string[] = [];
  // Extract text from <w:t> tags
  const regex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    textParts.push(match[1]);
  }

  // Group by paragraphs (rough approximation)
  const fullText = xml
    .split(/<\/w:p>/)
    .map((para) => {
      const parts: string[] = [];
      const tRegex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
      let m;
      while ((m = tRegex.exec(para)) !== null) {
        parts.push(m[1]);
      }
      return parts.join("");
    })
    .filter((p) => p.trim())
    .join("\n");

  return { text: fullText };
}

/** Parse XLSX/XLS/CSV — extract text as CSV per sheet */
function parseSpreadsheet(buffer: ArrayBuffer): ClientParsedResult {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheets: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    sheets.push(`--- Sheet: ${sheetName} ---\n${XLSX.utils.sheet_to_csv(sheet)}`);
  }
  return { text: sheets.join("\n\n") };
}

/** Parse PDF using pdfjs-dist */
async function parsePdf(buffer: ArrayBuffer): Promise<ClientParsedResult> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const textParts: string[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item: any) => item.str)
      .join(" ");
    textParts.push(pageText);
  }

  return { text: textParts.join("\n\n"), pageCount: doc.numPages };
}

/** Parse plain text files */
function parseText(buffer: ArrayBuffer): ClientParsedResult {
  const decoder = new TextDecoder("utf-8");
  return { text: decoder.decode(buffer) };
}

/** Main client-side parser — routes by file extension */
export async function parseFileClientSide(
  file: File
): Promise<ClientParsedResult> {
  const buffer = await file.arrayBuffer();
  const ext = file.name.split(".").pop()?.toLowerCase() || "";

  switch (ext) {
    case "pptx":
      return parsePptx(buffer);
    case "docx":
      return parseDocx(buffer);
    case "xlsx":
    case "xls":
    case "csv":
      return parseSpreadsheet(buffer);
    case "pdf":
      return parsePdf(buffer);
    default:
      return parseText(buffer);
  }
}
