"use client";

import { FileText, Download, Clock, Hash, FileType, MessageSquare, ExternalLink, BookOpen } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { MarkdownRenderer } from "./markdown-renderer";
import { getFileIcon } from "./file-upload";
import { useI18n } from "@/lib/i18n";

interface DocumentMetadata {
  fileName: string;
  fileType: string;
  fileSize: number;
  pageCount?: number;
  wordCount: number;
}

interface SearchArticle {
  title: string;
  url: string;
  snippet: string;
}

interface ReportViewProps {
  report: string;
  metadata: DocumentMetadata;
  articles?: SearchArticle[];
  onAskQuestion?: (question: string) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Match the last ## section that contains a numbered list of questions
const QUESTIONS_HEADING = /##\s*(?:Potential Questions|Вопросы[^\n]*|Questions[^\n]*)[\s\S]*?(?=\n##|$)/i;

function extractQuestions(report: string): string[] {
  const questionsMatch = report.match(QUESTIONS_HEADING);
  if (!questionsMatch) return [];

  const lines = questionsMatch[0].split("\n");
  const questions: string[] = [];
  for (const line of lines) {
    const match = line.match(/^\d+\.\s+(.+)/);
    if (match) {
      questions.push(match[1].trim().replace(/\*\*/g, ""));
    }
  }
  return questions;
}

function reportWithoutQuestions(report: string): string {
  return report.replace(QUESTIONS_HEADING, "").trim();
}

/** Renumber ![Рис. N — ...] sequentially (1, 2, 3...) in order of appearance */
function renumberImages(text: string): string {
  let counter = 0;
  return text.replace(/!\[Рис\.\s*\d+/g, () => {
    counter++;
    return `![Рис. ${counter}`;
  });
}

export function ReportView({ report, metadata, articles, onAskQuestion }: ReportViewProps) {
  const { t } = useI18n();
  const questions = extractQuestions(report);
  const stripped = questions.length > 0 ? reportWithoutQuestions(report) : report;
  const cleanReport = renumberImages(stripped);

  return (
    <div className="space-y-6">
      {/* Document info card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            {getFileIcon(metadata.fileName)}
            <div className="min-w-0 flex-1">
              <CardTitle className="truncate text-base">{metadata.fileName}</CardTitle>
              <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <FileType className="size-3" />
                  {metadata.fileType.toUpperCase()}
                </span>
                <span className="flex items-center gap-1">
                  <Download className="size-3" />
                  {formatFileSize(metadata.fileSize)}
                </span>
                <span className="flex items-center gap-1">
                  <Hash className="size-3" />
                  {metadata.wordCount.toLocaleString()} {t.words}
                </span>
                {metadata.pageCount && (
                  <span className="flex items-center gap-1">
                    <FileText className="size-3" />
                    {metadata.pageCount} {t.pages}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Clock className="size-3" />
                  {t.justNow}
                </span>
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Report content */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="size-5 text-primary" />
            {t.reportTitle}
          </CardTitle>
        </CardHeader>
        <Separator />
        <CardContent className="pt-6">
          <MarkdownRenderer content={cleanReport} />
        </CardContent>
      </Card>

      {/* Related articles from web search */}
      {articles && articles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BookOpen className="size-5 text-primary" />
              {t.relatedArticles}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {t.relatedArticlesDesc}
            </p>
          </CardHeader>
          <Separator />
          <CardContent className="pt-4">
            <div className="flex flex-col gap-3">
              {articles.map((article, i) => (
                <a
                  key={i}
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group rounded-lg border p-4 transition-all hover:border-primary/40 hover:bg-accent/50 hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h4 className="font-medium text-sm group-hover:text-primary transition-colors line-clamp-1">
                        {article.title}
                      </h4>
                      {article.snippet && (
                        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                          {article.snippet}
                        </p>
                      )}
                      <p className="mt-1.5 text-xs text-muted-foreground/70 truncate">
                        {new URL(article.url).hostname}
                      </p>
                    </div>
                    <ExternalLink className="size-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors mt-0.5" />
                  </div>
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Interactive questions */}
      {questions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <MessageSquare className="size-5 text-primary" />
              {t.diveDeeper}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {t.diveDeeperDesc}
            </p>
          </CardHeader>
          <Separator />
          <CardContent className="pt-4">
            <div className="flex flex-col gap-2">
              {questions.map((q, i) => (
                <button
                  key={i}
                  onClick={() => onAskQuestion?.(q)}
                  className="rounded-lg border px-4 py-3 text-left text-sm cursor-pointer hover:bg-accent hover:border-primary/30 active:scale-[0.98] active:bg-accent/80 transition-all duration-150"
                >
                  {q}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
