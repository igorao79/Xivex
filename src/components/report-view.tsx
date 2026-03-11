"use client";

import { FileText, Download, Clock, Hash, FileType } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { MarkdownRenderer } from "./markdown-renderer";
import { getFileIcon } from "./file-upload";

interface DocumentMetadata {
  fileName: string;
  fileType: string;
  fileSize: number;
  pageCount?: number;
  wordCount: number;
}

interface ReportViewProps {
  report: string;
  metadata: DocumentMetadata;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ReportView({ report, metadata }: ReportViewProps) {
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
                  {metadata.wordCount.toLocaleString()} words
                </span>
                {metadata.pageCount && (
                  <span className="flex items-center gap-1">
                    <FileText className="size-3" />
                    {metadata.pageCount} pages
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Clock className="size-3" />
                  Just now
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
            Analysis Report
          </CardTitle>
        </CardHeader>
        <Separator />
        <CardContent className="pt-6">
          <MarkdownRenderer content={report} />
        </CardContent>
      </Card>
    </div>
  );
}
