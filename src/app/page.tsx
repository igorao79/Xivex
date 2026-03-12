"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { motion } from "motion/react";
import { Sparkles, FileSearch, MessageSquare } from "lucide-react";
import { AnimatedTabs } from "@/components/animated-tabs";
import { FileUpload } from "@/components/file-upload";
import { ChatInterface } from "@/components/chat-interface";
import { ReportView } from "@/components/report-view";
import { ThemeToggle } from "@/components/theme-toggle";
import { LocaleToggle } from "@/components/locale-toggle";
import { RotatingText } from "@/components/rotating-text";
import { useChat } from "@/hooks/use-chat";
import { useI18n } from "@/lib/i18n";

interface DocumentState {
  id: string;
  metadata: {
    fileName: string;
    fileType: string;
    fileSize: number;
    pageCount?: number;
    wordCount: number;
  };
  report: string;
  articles: { title: string; url: string; snippet: string }[];
}

const FILE_TYPES = [".PDF", ".DOCX", ".XLSX", ".CSV", ".TXT", ".MD", ".JSON", ".HTML"];

export default function Home() {
  const { t } = useI18n();
  const [document, setDocument] = useState<DocumentState | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [activeTab, setActiveTab] = useState("upload");

  const { messages, isLoading, sendMessage, clearMessages } = useChat(
    document?.id || null
  );

  const suggestedQuestions = [t.sq1, t.sq2, t.sq3, t.sq4, t.sq5];

  const handleFileUpload = useCallback(async (file: File) => {
    setIsUploading(true);
    setUploadProgress(0);

    const progressInterval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 90) return prev;
        return prev + Math.random() * 15;
      });
    }, 500);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Upload failed");
      }

      const data = await response.json();

      setUploadProgress(100);

      setDocument({
        id: data.id,
        metadata: data.metadata,
        report: data.report,
        articles: data.articles || [],
      });

      setActiveTab("report");
      toast.success(t.uploadSuccess);
    } catch (error) {
      console.error("Upload error:", error);
      toast.error(
        error instanceof Error ? error.message : t.uploadError
      );
    } finally {
      clearInterval(progressInterval);
      setIsUploading(false);
      setUploadProgress(0);
    }
  }, [t]);

  const handleNewDocument = () => {
    setDocument(null);
    clearMessages();
    setActiveTab("upload");
  };

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-lg"
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-primary p-1.5">
              <Sparkles className="size-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold tracking-tight">
              Xi<span className="text-primary">vex</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            {document && (
              <button
                onClick={handleNewDocument}
                className="text-sm text-muted-foreground hover:text-foreground cursor-pointer active:scale-[0.97] transition-all duration-150"
              >
                {t.newDocument}
              </button>
            )}
            <LocaleToggle />
            <ThemeToggle />
          </div>
        </div>
      </motion.header>

      {/* Main content */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        {!document ? (
          /* Landing / Upload state */
          <div className="flex flex-col items-center justify-center py-8 md:py-16">
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.1, ease: "easeOut" }}
              className="mb-8 text-center"
            >
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
                {t.heroPrefix}{" "}
                <RotatingText
                  texts={FILE_TYPES}
                  rotationInterval={2600}
                  className="min-w-[4ch] justify-center"
                />{" "}
                {t.heroSuffix}
              </h1>
              <motion.p
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
                className="mt-3 text-lg text-muted-foreground max-w-2xl mx-auto"
              >
                {t.heroDesc}
              </motion.p>
            </motion.div>

            <motion.div
              initial={{ y: 40, opacity: 0, scale: 0.97 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, delay: 0.4, ease: "easeOut" }}
              className="w-full max-w-xl"
            >
              <FileUpload
                onFileUpload={handleFileUpload}
                isUploading={isUploading}
                progress={uploadProgress}
              />
            </motion.div>

          </div>
        ) : (
          /* Document view with tabs */
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <AnimatedTabs
              tabs={[
                {
                  value: "report",
                  label: t.tabReport,
                  icon: <FileSearch className="size-4" />,
                },
                {
                  value: "chat",
                  label: t.tabChat,
                  icon: <MessageSquare className="size-4" />,
                  badge:
                    messages.length > 0 ? (
                      <span className="ml-1 rounded-full bg-primary/20 px-1.5 py-0.5 text-xs">
                        {messages.length}
                      </span>
                    ) : undefined,
                },
              ]}
              value={activeTab}
              onValueChange={setActiveTab}
              className="mb-6"
            />

            {activeTab === "report" && (
              <motion.div
                key="report"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
              >
                <ReportView
                  report={document.report}
                  metadata={document.metadata}
                  articles={document.articles}
                  onAskQuestion={(q) => {
                    sendMessage(q);
                    setActiveTab("chat");
                  }}
                />
              </motion.div>
            )}

            {activeTab === "chat" && (
              <motion.div
                key="chat"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="h-[calc(100vh-220px)]"
              >
                <div className="h-full rounded-xl border bg-card overflow-hidden">
                  <ChatInterface
                    messages={messages}
                    isLoading={isLoading}
                    onSendMessage={sendMessage}
                    onClear={clearMessages}
                    suggestedQuestions={suggestedQuestions}
                  />
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </main>

    </div>
  );
}
