import {
  chunkText,
  storeDocument,
  getDocument,
  getAllDocuments,
  deleteDocument,
  searchChunks,
} from "@/lib/store";
import type { ParsedDocument } from "@/lib/parsers";

function makeParsed(text: string, fileName = "test.txt"): ParsedDocument {
  return {
    text,
    metadata: {
      fileName,
      fileType: "txt",
      fileSize: Buffer.byteLength(text),
      wordCount: text.split(/\s+/).filter(Boolean).length,
    },
  };
}

describe("chunkText", () => {
  it("returns a single chunk for short text", () => {
    const chunks = chunkText("Hello world");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe("Hello world");
  });

  it("splits long text into overlapping chunks", () => {
    const text = "a".repeat(2500);
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    // Chunks should overlap
    expect(chunks[0].length).toBe(1000);
  });

  it("handles empty string", () => {
    const chunks = chunkText("");
    expect(chunks).toHaveLength(0);
  });
});

describe("Document store", () => {
  beforeEach(() => {
    // Clean up documents between tests
    for (const doc of getAllDocuments()) {
      deleteDocument(doc.id);
    }
  });

  it("stores and retrieves a document", () => {
    const parsed = makeParsed("This is a test document about machine learning.");
    const doc = storeDocument("test-1", parsed);

    expect(doc.id).toBe("test-1");
    expect(doc.chunks.length).toBeGreaterThan(0);
    expect(doc.parsed.metadata.fileName).toBe("test.txt");

    const retrieved = getDocument("test-1");
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe("test-1");
  });

  it("returns undefined for non-existent document", () => {
    expect(getDocument("nonexistent")).toBeUndefined();
  });

  it("lists all documents", () => {
    storeDocument("doc-a", makeParsed("Doc A content"));
    storeDocument("doc-b", makeParsed("Doc B content"));

    const all = getAllDocuments();
    expect(all).toHaveLength(2);
  });

  it("deletes a document", () => {
    storeDocument("to-delete", makeParsed("Delete me"));
    expect(deleteDocument("to-delete")).toBe(true);
    expect(getDocument("to-delete")).toBeUndefined();
  });
});

describe("searchChunks", () => {
  beforeEach(() => {
    for (const doc of getAllDocuments()) {
      deleteDocument(doc.id);
    }
  });

  it("finds chunks matching query terms", () => {
    const text =
      "Machine learning is a subset of artificial intelligence. Deep learning uses neural networks. Natural language processing handles text data.";
    storeDocument("search-test", makeParsed(text));

    const results = searchChunks("neural networks deep learning");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].text).toContain("neural networks");
  });

  it("returns empty array when no matches", () => {
    storeDocument("search-test", makeParsed("Cooking recipes for pasta"));
    const results = searchChunks("quantum physics equations");
    expect(results).toHaveLength(0);
  });

  it("scopes search to specific document", () => {
    storeDocument("doc-1", makeParsed("Machine learning algorithms"));
    storeDocument("doc-2", makeParsed("Cooking pasta recipes"));

    const results = searchChunks("machine learning", "doc-2");
    expect(results).toHaveLength(0);
  });
});
