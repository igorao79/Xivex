"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { Sparkles, FileSearch, MessageSquare, Zap } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FileUpload } from "@/components/file-upload";
import { ChatInterface } from "@/components/chat-interface";
import { ReportView } from "@/components/report-view";
import { ThemeToggle } from "@/components/theme-toggle";
import { useChat } from "@/hooks/use-chat";

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
}

const SUGGESTED_QUESTIONS = [
  "What are the main topics covered in this document?",
  "Summarize the key findings and conclusions",
  "What are the most important data points?",
  "Are there any recommendations or action items?",
  "What questions remain unanswered?",
];

export default function Home() {
  const [document, setDocument] = useState<DocumentState | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [activeTab, setActiveTab] = useState("upload");

  const { messages, isLoading, sendMessage, clearMessages } = useChat(
    document?.id || null
  );

  const handleFileUpload = useCallback(async (file: File) => {
    setIsUploading(true);
    setUploadProgress(0);

    // Simulate progress while the API processes
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
      });

      setActiveTab("report");
      toast.success("Document analyzed successfully!");
    } catch (error) {
      console.error("Upload error:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to upload document"
      );
    } finally {
      clearInterval(progressInterval);
      setIsUploading(false);
      setUploadProgress(0);
    }
  }, []);

  const handleNewDocument = () => {
    setDocument(null);
    clearMessages();
    setActiveTab("upload");
  };

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-lg">
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
                + New Document
              </button>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        {!document ? (
          /* Landing / Upload state */
          <div className="flex flex-col items-center justify-center py-8 md:py-16 animate-fade-in">
            <div className="mb-8 text-center">
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
                Analyze any document with{" "}
                <span className="text-primary">AI</span>
              </h1>
              <p className="mt-3 text-lg text-muted-foreground max-w-2xl mx-auto">
                Upload a PDF, Word doc, spreadsheet, or text file. Get an instant
                AI-powered report, then ask follow-up questions in chat.
              </p>
            </div>

            <div className="w-full max-w-xl">
              <FileUpload
                onFileUpload={handleFileUpload}
                isUploading={isUploading}
                progress={uploadProgress}
              />
            </div>

            {/* Features */}
            <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3 w-full max-w-3xl">
              {[
                {
                  icon: FileSearch,
                  title: "Deep Analysis",
                  desc: "AI reads your entire document and generates a comprehensive report",
                },
                {
                  icon: MessageSquare,
                  title: "Interactive Chat",
                  desc: "Ask follow-up questions and get answers sourced from your document",
                },
                {
                  icon: Zap,
                  title: "Lightning Fast",
                  desc: "Powered by Groq for near-instant responses",
                },
              ].map((feature) => (
                <div
                  key={feature.title}
                  className="flex flex-col items-center rounded-xl border bg-card p-6 text-center"
                >
                  <div className="mb-3 rounded-full bg-primary/10 p-3">
                    <feature.icon className="size-6 text-primary" />
                  </div>
                  <h3 className="font-semibold">{feature.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {feature.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Document view with tabs */
          <div className="animate-fade-in">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="mb-6">
                <TabsTrigger value="report" className="gap-1.5">
                  <FileSearch className="size-4" />
                  <span className="hidden sm:inline">Report</span>
                </TabsTrigger>
                <TabsTrigger value="chat" className="gap-1.5">
                  <MessageSquare className="size-4" />
                  <span className="hidden sm:inline">Chat</span>
                  {messages.length > 0 && (
                    <span className="ml-1 rounded-full bg-primary/20 px-1.5 py-0.5 text-xs">
                      {messages.length}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="report">
                <ReportView
                  report={document.report}
                  metadata={document.metadata}
                />
              </TabsContent>

              <TabsContent value="chat" className="h-[calc(100vh-220px)]">
                <div className="h-full rounded-xl border bg-card overflow-hidden">
                  <ChatInterface
                    messages={messages}
                    isLoading={isLoading}
                    onSendMessage={sendMessage}
                    onClear={clearMessages}
                    suggestedQuestions={SUGGESTED_QUESTIONS}
                  />
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-center px-4 sm:px-6">
          <p className="text-xs text-muted-foreground">
            Powered by Groq &bull; Built with Next.js &bull; Xivex
          </p>
        </div>
      </footer>
    </div>
  );
}
