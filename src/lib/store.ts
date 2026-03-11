import type { ParsedDocument } from "./parsers";

export interface DocumentChunk {
  id: string;
  text: string;
  index: number;
}

export interface StoredDocument {
  id: string;
  parsed: ParsedDocument;
  chunks: DocumentChunk[];
  uploadedAt: number;
}

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;

// In-memory store — per-server-instance session storage
const documents = new Map<string, StoredDocument>();

export function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    chunks.push(text.slice(start, end));
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks;
}

export function storeDocument(id: string, parsed: ParsedDocument): StoredDocument {
  const textChunks = chunkText(parsed.text);
  const chunks: DocumentChunk[] = textChunks.map((text, index) => ({
    id: `${id}-chunk-${index}`,
    text,
    index,
  }));

  const doc: StoredDocument = {
    id,
    parsed,
    chunks,
    uploadedAt: Date.now(),
  };

  documents.set(id, doc);
  return doc;
}

export function getDocument(id: string): StoredDocument | undefined {
  return documents.get(id);
}

export function getAllDocuments(): StoredDocument[] {
  return Array.from(documents.values());
}

export function deleteDocument(id: string): boolean {
  return documents.delete(id);
}

export function searchChunks(query: string, docId?: string): DocumentChunk[] {
  const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const results: { chunk: DocumentChunk; score: number }[] = [];

  const docs = docId ? [documents.get(docId)].filter(Boolean) : Array.from(documents.values());

  for (const doc of docs) {
    if (!doc) continue;
    for (const chunk of doc.chunks) {
      const lowerText = chunk.text.toLowerCase();
      let score = 0;
      for (const term of queryTerms) {
        const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
        const matches = lowerText.match(regex);
        if (matches) score += matches.length;
      }
      if (score > 0) {
        results.push({ chunk, score });
      }
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 10).map((r) => r.chunk);
}
