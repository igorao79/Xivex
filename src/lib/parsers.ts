// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse");
import mammoth from "mammoth";
import * as XLSX from "xlsx";

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
