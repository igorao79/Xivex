"use client";

import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileText, FileSpreadsheet, File, Presentation } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

interface FileUploadProps {
  onFileUpload: (file: File) => void;
  isUploading: boolean;
  progress: number;
}

const ACCEPTED_TYPES: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/vnd.ms-excel": [".xls"],
  "text/csv": [".csv"],
  "text/plain": [".txt"],
  "text/markdown": [".md"],
  "application/json": [".json"],
  "text/html": [".html"],
  "application/xml": [".xml"],
};

function getFileIcon(fileName: string) {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return <FileText className="size-8 text-red-500" />;
  if (ext === "pptx") return <Presentation className="size-8 text-orange-500" />;
  if (["xlsx", "xls", "csv"].includes(ext || "")) return <FileSpreadsheet className="size-8 text-green-500" />;
  if (["docx", "doc"].includes(ext || "")) return <FileText className="size-8 text-blue-500" />;
  return <File className="size-8 text-muted-foreground" />;
}

export function FileUpload({ onFileUpload, isUploading, progress }: FileUploadProps) {
  const { t } = useI18n();

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0 && !isUploading) {
        onFileUpload(acceptedFiles[0]);
      }
    },
    [onFileUpload, isUploading]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxFiles: 1,
    maxSize: 50 * 1024 * 1024, // 50MB
    disabled: isUploading,
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        "relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 transition-all cursor-pointer",
        "hover:border-primary/50 hover:bg-primary/5",
        isDragActive && "border-primary bg-primary/10 scale-[1.02]",
        isUploading && "pointer-events-none opacity-60",
        "min-h-[200px] md:min-h-[260px]"
      )}
    >
      <input {...getInputProps()} />

      {isUploading ? (
        <div className="flex flex-col items-center gap-4">
          <div className="relative size-16">
            <svg className="animate-spin size-16" viewBox="0 0 50 50">
              <circle
                className="stroke-primary/20"
                cx="25" cy="25" r="20"
                fill="none" strokeWidth="4"
              />
              <circle
                className="stroke-primary"
                cx="25" cy="25" r="20"
                fill="none" strokeWidth="4"
                strokeDasharray={`${progress * 1.26} 126`}
                strokeLinecap="round"
                transform="rotate(-90 25 25)"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold">
              {Math.round(progress)}%
            </span>
          </div>
          <p className="text-sm text-muted-foreground animate-pulse">
            {t.analyzing}
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4 rounded-full bg-primary/10 p-4">
            <Upload className="size-8 text-primary" />
          </div>
          <p className="mb-1 text-lg font-semibold">
            {isDragActive ? t.uploadDrop : t.uploadTitle}
          </p>
          <p className="text-sm text-muted-foreground text-center max-w-xs">
            {t.uploadHint}
          </p>
          <div className="mt-4 flex gap-2 flex-wrap justify-center">
            {[".pdf", ".docx", ".pptx", ".xlsx", ".csv", ".txt"].map((ext) => (
              <span
                key={ext}
                className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground"
              >
                {ext}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export { getFileIcon };
