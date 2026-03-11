import React from "react";

function ReactMarkdown({ children }: { children: string }) {
  // Simple mock that renders markdown-like content as HTML-ish
  const lines = children.split("\n");
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith("## ")) {
      elements.push(<h2 key={i}>{line.slice(3)}</h2>);
    } else if (line.startsWith("# ")) {
      elements.push(<h1 key={i}>{line.slice(2)}</h1>);
    } else if (line.startsWith("- ")) {
      elements.push(<li key={i}>{line.slice(2)}</li>);
    } else if (line.startsWith("|")) {
      // Simple table parsing
      const cells = line
        .split("|")
        .filter(Boolean)
        .map((c) => c.trim())
        .filter((c) => !c.match(/^-+$/));
      if (cells.length > 0) {
        elements.push(
          <tr key={i}>
            {cells.map((cell, j) => (
              <td key={j}>{cell}</td>
            ))}
          </tr>
        );
      }
    } else {
      // Handle inline formatting
      const formatted = line
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(/`(.+?)`/g, "<code>$1</code>");

      elements.push(
        <p key={i} dangerouslySetInnerHTML={{ __html: formatted }} />
      );
    }
  }

  return <div data-testid="markdown">{elements}</div>;
}

export default ReactMarkdown;
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type Components = {};
