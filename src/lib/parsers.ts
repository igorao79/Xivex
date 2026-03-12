// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse");
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import JSZip from "jszip";

export interface ParsedDocument {
  text: string;
  metadata: {
    fileName: string;
    fileType: string;
    fileSize: number;
    pageCount?: number;
    wordCount: number;
  };
}

/**
 * Extract text from a PPTX file (PowerPoint).
 * PPTX is a ZIP archive containing XML slides.
 */
async function parsePptx(buffer: Buffer): Promise<{ text: string; slideCount: number }> {
  const zip = await JSZip.loadAsync(buffer);
  const slides: { index: number; text: string }[] = [];

  for (const [path, file] of Object.entries(zip.files)) {
    // Match slide XML files: ppt/slides/slide1.xml, slide2.xml, etc.
    const slideMatch = path.match(/^ppt\/slides\/slide(\d+)\.xml$/);
    if (!slideMatch) continue;

    const xml = await file.async("text");
    // Extract all text runs from the XML
    const textParts: string[] = [];
    // Match <a:t>...</a:t> tags which contain the actual text
    const regex = /<a:t[^>]*>([\s\S]*?)<\/a:t>/g;
    let match;
    while ((match = regex.exec(xml)) !== null) {
      const t = match[1].trim();
      if (t) textParts.push(t);
    }

    if (textParts.length > 0) {
      slides.push({
        index: parseInt(slideMatch[1]),
        text: textParts.join(" "),
      });
    }
  }

  // Sort by slide number
  slides.sort((a, b) => a.index - b.index);

  const text = slides
    .map((s) => `--- Slide ${s.index} ---\n${s.text}`)
    .join("\n\n");

  return { text, slideCount: slides.length };
}

export async function parseDocument(
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<ParsedDocument> {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  let text = "";
  let pageCount: number | undefined;

  if (mimeType === "application/pdf" || ext === "pdf") {
    const data = await pdfParse(buffer);
    text = data.text;
    pageCount = data.numpages;
  } else if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ext === "docx"
  ) {
    const result = await mammoth.extractRawText({ buffer });
    text = result.value;
  } else if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    ext === "pptx"
  ) {
    const result = await parsePptx(buffer);
    text = result.text;
    pageCount = result.slideCount;
  } else if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "application/vnd.ms-excel" ||
    ext === "xlsx" ||
    ext === "xls" ||
    ext === "csv"
  ) {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheets: string[] = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      sheets.push(`--- Sheet: ${sheetName} ---\n${XLSX.utils.sheet_to_csv(sheet)}`);
    }
    text = sheets.join("\n\n");
  } else {
    // Plain text, markdown, code files, etc.
    text = buffer.toString("utf-8");
  }

  const wordCount = text.split(/\s+/).filter(Boolean).length;

  return {
    text,
    metadata: {
      fileName,
      fileType: ext,
      fileSize: buffer.length,
      pageCount,
      wordCount,
    },
  };
}
