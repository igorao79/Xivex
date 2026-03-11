import { parseDocument } from "@/lib/parsers";

describe("parseDocument", () => {
  it("parses plain text files", async () => {
    const text = "Hello, this is a test document with some content.";
    const buffer = Buffer.from(text, "utf-8");

    const result = await parseDocument(buffer, "test.txt", "text/plain");

    expect(result.text).toBe(text);
    expect(result.metadata.fileName).toBe("test.txt");
    expect(result.metadata.fileType).toBe("txt");
    expect(result.metadata.wordCount).toBe(9);
    expect(result.metadata.fileSize).toBe(buffer.length);
  });

  it("parses markdown files", async () => {
    const text = "# Heading\n\nSome **bold** text and a [link](http://example.com).";
    const buffer = Buffer.from(text, "utf-8");

    const result = await parseDocument(buffer, "readme.md", "text/markdown");

    expect(result.text).toContain("# Heading");
    expect(result.metadata.fileType).toBe("md");
  });

  it("parses JSON files", async () => {
    const json = JSON.stringify({ name: "test", value: 42 }, null, 2);
    const buffer = Buffer.from(json, "utf-8");

    const result = await parseDocument(buffer, "data.json", "application/json");

    expect(result.text).toContain('"name"');
    expect(result.metadata.fileType).toBe("json");
  });

  it("parses CSV content as Excel", async () => {
    const csv = "Name,Age,City\nAlice,30,NYC\nBob,25,LA";
    const buffer = Buffer.from(csv, "utf-8");

    const result = await parseDocument(buffer, "data.csv", "text/csv");

    expect(result.text).toContain("Alice");
    expect(result.text).toContain("Bob");
    expect(result.metadata.fileType).toBe("csv");
  });

  it("includes word count in metadata", async () => {
    const text = "one two three four five";
    const buffer = Buffer.from(text, "utf-8");

    const result = await parseDocument(buffer, "count.txt", "text/plain");

    expect(result.metadata.wordCount).toBe(5);
  });

  it("handles empty files", async () => {
    const buffer = Buffer.from("", "utf-8");
    const result = await parseDocument(buffer, "empty.txt", "text/plain");

    expect(result.text).toBe("");
    expect(result.metadata.wordCount).toBe(0);
  });
});
