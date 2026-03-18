"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { motion } from "motion/react";
import { FileSearch, MessageSquare, Bot } from "lucide-react";
import Image from "next/image";
import { AnimatedTabs } from "@/components/animated-tabs";
import { FileUpload } from "@/components/file-upload";
import { ChatInterface } from "@/components/chat-interface";
import { ChatSidebar } from "@/components/chat-sidebar";
import { ReportView } from "@/components/report-view";
import { ThemeToggle } from "@/components/theme-toggle";
import { LocaleToggle } from "@/components/locale-toggle";
import { UserMenu } from "@/components/user-menu";
import { RotatingText } from "@/components/rotating-text";
import { useChat } from "@/hooks/use-chat";
import { useAgentChat } from "@/hooks/use-agent-chat";
import { useConversations } from "@/hooks/use-conversations";
import { useI18n } from "@/lib/i18n";
import { parseFileClientSide } from "@/lib/client-parsers";

type AppMode = "analysis" | "chat";

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

const FILE_TYPES = [".PDF", ".DOCX", ".PPTX", ".XLSX", ".CSV", ".TXT", ".MD", ".JSON", ".HTML"];

export default function Home() {
  const { t, locale } = useI18n();
  const [appMode, setAppMode] = useState<AppMode>("analysis");
  const [document, setDocument] = useState<DocumentState | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [activeTab, setActiveTab] = useState("upload");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Conversations (Turso)
  const {
    conversations,
    activeId,
    setActiveId,
    createConversation,
    updateTitle,
    deleteConversation,
    saveMessage,
    updateMessage,
    loadMessages,
  } = useConversations();

  // Document chat
  const { messages, isLoading, sendMessage, clearMessages } = useChat(
    document?.id || null
  );

  // Use ref to always have latest activeId in callbacks
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;

  // Persistence callbacks for agent chat
  const persist = useMemo(
    () => ({
      onUserMessage: async (msg: { id: string; role: string; content: string }) => {
        const id = activeIdRef.current;
        if (!id) return;
        saveMessage(id, msg);
        // Auto-title: generate AI title from first user message
        const conv = conversationsRef.current.find((c) => c.id === id);
        if (conv && (conv.title === "New chat" || conv.title === "Новый чат")) {
          // Set temporary title immediately, then replace with AI title
          updateTitle(id, msg.content.slice(0, 30) + "…");
          fetch("/api/conversations/title", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: msg.content }),
          })
            .then((res) => res.json())
            .then((data) => {
              if (data.title) updateTitle(id, data.title);
            })
            .catch(() => {});
        }
      },
      onAssistantDone: async (msg: {
        id: string;
        role: string;
        content: string;
        sources?: { title: string; url: string }[];
      }) => {
        const id = activeIdRef.current;
        if (!id) return;
        saveMessage(id, msg);
      },
    }),
    [activeId, conversations, saveMessage, updateTitle]
  );

  // Agent chat (standalone, with web search)
  const {
    messages: agentMessages,
    isLoading: agentLoading,
    toolStatus,
    sendMessage: agentSend,
    regenerate: agentRegenerate,
    clearMessages: agentClear,
    setMessagesFromDB,
  } = useAgentChat(persist);

  const suggestedQuestions = [t.sq1, t.sq2, t.sq3, t.sq4, t.sq5];

  // Dynamic agent suggestions from trending topics
  const [agentSuggestedQuestions, setAgentSuggestions] = useState<string[]>([
    t.agentSq1, t.agentSq2, t.agentSq3, t.agentSq4,
  ]);

  useEffect(() => {
    fetch(`/api/suggestions?locale=${locale}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.questions?.length >= 4) {
          setAgentSuggestions(data.questions.slice(0, 4));
        }
      })
      .catch(() => {});
  }, [locale]);

  // Load messages when active conversation changes
  useEffect(() => {
    if (!activeId) {
      agentClear();
      return;
    }

    loadMessages(activeId).then((msgs) => {
      if (msgs && msgs.length > 0) {
        setMessagesFromDB(msgs);
      } else {
        agentClear();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // Auto-create conversation on first message
  const wrappedAgentSend = useCallback(
    async (content: string, image?: string) => {
      if (!activeId) {
        // createConversation sets activeId via setState AND returns the id
        // We use the ref approach so persist callbacks see the new id immediately
        await createConversation("chat");
        // Give React a tick to flush the state update into the ref
        await new Promise((r) => setTimeout(r, 0));
      }
      agentSend(content, image);
    },
    [activeId, createConversation, agentSend]
  );

  const handleNewChat = useCallback(async () => {
    await createConversation("chat");
    agentClear();
  }, [createConversation, agentClear]);

  const handleSelectConversation = useCallback(
    (id: string) => {
      setActiveId(id);
      setSidebarOpen(false);
    },
    [setActiveId]
  );

  const handleRenameConversation = useCallback(
    async (id: string, title: string) => {
      await updateTitle(id, title);
    },
    [updateTitle]
  );

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      await deleteConversation(id);
      if (activeId === id) {
        agentClear();
      }
    },
    [deleteConversation, activeId, agentClear]
  );

  const handleFileUpload = useCallback(async (file: File) => {
    setIsUploading(true);
    setUploadProgress(0);

    const progressInterval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 90) return 90;
        const next = prev + Math.random() * 12;
        return Math.min(next, 90);
      });
    }, 500);

    try {
      const parsed = await parseFileClientSide(file);
      if (!parsed.text.trim()) {
        throw new Error("Could not extract text from the document.");
      }

      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      const response = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: parsed.text,
          fileName: file.name,
          fileType: ext,
          fileSize: file.size,
          pageCount: parsed.pageCount,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Upload failed" }));
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

  const handleLogoClick = () => {
    setAppMode("analysis");
    handleNewDocument();
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
        <div className="mx-auto flex h-14 sm:h-16 max-w-7xl items-center justify-between px-3 sm:px-6">
          {/* Left: logo + mode switcher */}
          <div className="flex items-center gap-2 sm:gap-4">
            <button
              onClick={handleLogoClick}
              className="flex items-center gap-1.5 sm:gap-2 cursor-pointer hover:opacity-80 active:scale-[0.97] transition-all duration-150"
            >
              <Image
                src="/logotip.webp"
                alt="Xivex"
                width={32}
                height={32}
                className="size-7 sm:size-8 dark:invert-0 invert"
                priority
              />
              <span className="hidden xs:inline text-xl font-bold tracking-tight">
                Xi<span className="text-primary">vex</span>
              </span>
            </button>

            {/* Mode switcher — icons on mobile, labels on desktop */}
            <div className="flex items-center rounded-lg border bg-muted/50 p-0.5">
              <button
                onClick={() => setAppMode("analysis")}
                className={`flex items-center gap-1.5 rounded-md px-2 py-1 sm:px-3 sm:py-1.5 text-sm font-medium transition-all duration-200 cursor-pointer ${
                  appMode === "analysis"
                    ? "bg-primary text-primary-foreground shadow-sm shadow-primary/25"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <FileSearch className="size-3.5" />
                <span className="hidden sm:inline">{t.modeAnalysis}</span>
              </button>
              <button
                onClick={() => setAppMode("chat")}
                className={`flex items-center gap-1.5 rounded-md px-2 py-1 sm:px-3 sm:py-1.5 text-sm font-medium transition-all duration-200 cursor-pointer ${
                  appMode === "chat"
                    ? "bg-primary text-primary-foreground shadow-sm shadow-primary/25"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <Bot className="size-3.5" />
                <span className="hidden sm:inline">{t.modeChat}</span>
              </button>
            </div>
          </div>

          {/* Right: controls */}
          <div className="flex items-center gap-1 sm:gap-2">
            {appMode === "analysis" && document && (
              <button
                onClick={handleNewDocument}
                className="hidden sm:block text-sm text-muted-foreground hover:text-foreground cursor-pointer active:scale-[0.97] transition-all duration-150"
              >
                {t.newDocument}
              </button>
            )}
            <LocaleToggle />
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </motion.header>

      {/* Chat sidebar (only in chat mode) */}
      {appMode === "chat" && (
        <ChatSidebar
          conversations={conversations.filter((c) => c.mode === "chat")}
          activeId={activeId}
          onSelect={handleSelectConversation}
          onNew={handleNewChat}
          onDelete={handleDeleteConversation}
          onRename={handleRenameConversation}
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
        />
      )}

      {/* Main content */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        {appMode === "chat" ? (
          /* Agent chat mode */
          <motion.div
            key="agent-chat"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="h-[calc(100vh-120px)]"
          >
            <div className="h-full rounded-xl border bg-card overflow-hidden max-w-4xl mx-auto">
              <ChatInterface
                messages={agentMessages}
                isLoading={agentLoading}
                onSendMessage={wrappedAgentSend}
                onClear={agentClear}
                onRegenerate={agentRegenerate}
                suggestedQuestions={agentSuggestedQuestions}
                toolStatus={toolStatus}
                title={t.agentTitle}
                emptyText={t.agentEmpty}
                emptyHint={t.agentEmptyHint}
                placeholder={t.agentPlaceholder}
              />
            </div>
          </motion.div>
        ) : !document ? (
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
