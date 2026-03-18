"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Components } from "react-markdown";

function CodeCopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-all cursor-pointer"
    >
      {copied ? (
        <>
          <Check className="size-3.5 text-green-400" />
          <span>Copied</span>
        </>
      ) : (
        <>
          <Copy className="size-3.5" />
          <span>Copy</span>
        </>
      )}
    </button>
  );
}

const components: Components = {
  h1: ({ children }) => (
    <h1 className="mb-4 mt-6 text-2xl font-bold first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-3 mt-5 text-xl font-semibold first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-2 mt-4 text-lg font-semibold first:mt-0">{children}</h3>
  ),
  p: ({ children }) => <p className="mb-3 leading-7 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-3 ml-6 list-disc space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 ml-6 list-decimal space-y-1">{children}</ol>,
  li: ({ children }) => <li className="leading-7">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="mb-3 border-l-4 border-primary/30 pl-4 italic text-muted-foreground">
      {children}
    </blockquote>
  ),
  code: ({ children, className }) => {
    const match = /language-(\w+)/.exec(className || "");
    const lang = match ? match[1] : "";
    const codeString = String(children).replace(/\n$/, "");
    const isInline = !className && !codeString.includes("\n");

    if (isInline) {
      return (
        <code className="rounded-md bg-muted px-1.5 py-0.5 text-[13px] font-mono text-primary/90">
          {children}
        </code>
      );
    }

    return (
      <div className="group relative mb-3 rounded-lg overflow-hidden border border-zinc-700/50">
        {/* Header with language label + copy button */}
        <div className="flex items-center justify-between bg-zinc-800 px-4 py-2 text-xs">
          <span className="text-zinc-400 font-mono uppercase tracking-wider">
            {lang || "code"}
          </span>
          <CodeCopyButton code={codeString} />
        </div>
        <SyntaxHighlighter
          style={oneDark}
          language={lang || "text"}
          PreTag="div"
          customStyle={{
            margin: 0,
            borderRadius: 0,
            padding: "1rem",
            fontSize: "13px",
            lineHeight: "1.6",
            background: "#1e1e2e",
          }}
          codeTagProps={{
            style: { fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace" },
          }}
        >
          {codeString}
        </SyntaxHighlighter>
      </div>
    );
  },
  table: ({ children }) => (
    <div className="mb-3 overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted">{children}</thead>,
  th: ({ children }) => (
    <th className="px-4 py-2 text-left font-semibold">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border-t px-4 py-2">{children}</td>
  ),
  img: () => null, // replaced dynamically in getComponents
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline underline-offset-4 hover:text-primary/80"
    >
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  hr: () => <hr className="my-4 border-border" />,
};

export function MarkdownRenderer({
  content,
  isStreaming,
  onImageClick,
}: {
  content: string;
  isStreaming?: boolean;
  onImageClick?: (src: string) => void;
}) {
  const mergedComponents: Components = {
    ...components,
    img: ({ src, alt }) => (
      <span className="my-4 block">
        <img
          src={src}
          alt={alt || ""}
          loading="lazy"
          className={cn(
            "rounded-lg border max-h-[300px] w-auto object-contain",
            onImageClick && "cursor-zoom-in hover:opacity-90 transition-opacity"
          )}
          onClick={() => typeof src === "string" && onImageClick?.(src)}
          onError={(e) => {
            const wrapper = (e.target as HTMLImageElement).parentElement;
            if (wrapper) wrapper.style.display = "none";
          }}
        />
        {alt && (
          <span className="mt-1.5 block text-xs text-muted-foreground italic">
            {alt}
          </span>
        )}
      </span>
    ),
  };

  return (
    <div className="prose-custom text-sm">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mergedComponents}>
        {content}
      </ReactMarkdown>
      {isStreaming && (
        <span className="inline-block w-[3px] h-[18px] bg-primary animate-pulse rounded-sm ml-0.5 -mb-[3px]" />
      )}
    </div>
  );
}
