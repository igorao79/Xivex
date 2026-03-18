"use client";

import { useState, useRef, useEffect } from "react";
import {
  Send,
  Loader2,
  User,
  Bot,
  Trash2,
  Globe,
  FileText as FileTextIcon,
  Copy,
  Check,
  RefreshCw,
  ChevronDown,
  ExternalLink,
  ImagePlus,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MarkdownRenderer } from "./markdown-renderer";
import type { Message, MessageSource } from "@/hooks/use-chat";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

function ImageLightbox({
  src,
  onClose,
}: {
  src: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm cursor-zoom-out"
      onClick={onClose}
    >
      <motion.img
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ duration: 0.2 }}
        src={src}
        alt=""
        className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
      <button
        onClick={onClose}
        className="absolute top-4 right-4 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 transition-colors cursor-pointer"
      >
        <X className="size-5" />
      </button>
    </motion.div>
  );
}

export interface ToolStatusDisplay {
  type: "searching" | "reading";
  detail: string;
}

interface ChatInterfaceProps {
  messages: Message[];
  isLoading: boolean;
  onSendMessage: (content: string, image?: string) => void;
  onClear: () => void;
  onRegenerate?: () => void;
  suggestedQuestions?: string[];
  toolStatus?: ToolStatusDisplay | null;
  title?: string;
  emptyText?: string;
  emptyHint?: string;
  placeholder?: string;
}

function CopyButton({ text }: { text: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-all cursor-pointer"
      title={t.copy}
    >
      {copied ? (
        <>
          <Check className="size-3.5 text-green-500" />
          <span className="text-green-500">{t.copied}</span>
        </>
      ) : (
        <>
          <Copy className="size-3.5" />
          <span>{t.copy}</span>
        </>
      )}
    </button>
  );
}

function SourcesCollapsible({ sources }: { sources: MessageSource[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  if (!sources || sources.length === 0) return null;

  return (
    <div className="mt-3 rounded-lg border bg-muted/30">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium cursor-pointer hover:bg-muted/50 rounded-lg transition-colors"
      >
        <div className="flex items-center gap-2">
          <Globe className="size-3.5 text-primary" />
          <span>{t.sources}</span>
          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
            {sources.length}
          </span>
        </div>
        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t px-3 py-2 space-y-1.5">
              {sources.map((source, i) => (
                <a
                  key={i}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted transition-colors group"
                >
                  <ExternalLink className="size-3.5 mt-0.5 text-muted-foreground group-hover:text-primary shrink-0" />
                  <span className="text-foreground group-hover:text-primary line-clamp-1">
                    {source.title}
                  </span>
                </a>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ChatInterface({
  messages,
  isLoading,
  onSendMessage,
  onClear,
  onRegenerate,
  suggestedQuestions = [],
  toolStatus,
  title,
  emptyText,
  emptyHint,
  placeholder,
}: ChatInterfaceProps) {
  const { t } = useI18n();
  const [input, setInput] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    if (file.size > 4 * 1024 * 1024) return; // 4MB max

    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((input.trim() || imagePreview) && !isLoading) {
      onSendMessage(input.trim(), imagePreview || undefined);
      setInput("");
      setImagePreview(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const lastAssistantIdx = messages.length - 1;
  const canRegenerate =
    onRegenerate &&
    !isLoading &&
    messages.length >= 2 &&
    messages[lastAssistantIdx]?.role === "assistant" &&
    messages[lastAssistantIdx]?.content;

  return (
    <div className="flex h-full flex-col">
      {/* Image lightbox */}
      <AnimatePresence>
        {lightboxSrc && (
          <ImageLightbox
            src={lightboxSrc}
            onClose={() => setLightboxSrc(null)}
          />
        )}
      </AnimatePresence>

      {/* Chat header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-primary/10 p-1.5">
            <Bot className="size-4 text-primary" />
          </div>
          <h2 className="font-semibold">{title || t.chatTitle}</h2>
        </div>
        {messages.length > 0 && (
          <Button variant="ghost" size="sm" onClick={onClear}>
            <Trash2 className="size-4" />
            <span className="hidden sm:inline ml-1">{t.chatClear}</span>
          </Button>
        )}
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 py-12">
            <div className="rounded-full bg-primary/10 p-4">
              <Bot className="size-8 text-primary" />
            </div>
            <div className="text-center">
              <p className="font-medium">{emptyText || t.chatEmpty}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {emptyHint || t.chatEmptyHint}
              </p>
            </div>
            {suggestedQuestions.length > 0 && (
              <div className="mt-4 flex flex-col gap-2 w-full max-w-md">
                {suggestedQuestions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => onSendMessage(q)}
                    className="rounded-lg border px-4 py-2.5 text-left text-sm cursor-pointer hover:bg-accent hover:border-primary/30 active:scale-[0.98] active:bg-accent/80 transition-all duration-150"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {messages.map((message, idx) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
              >
                {message.role === "user" ? (
                  /* ─── User message ─── */
                  <div className="flex gap-3 justify-end">
                    <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-4 py-3">
                      {message.image && (
                        <img
                          src={message.image}
                          alt=""
                          className="rounded-lg max-h-[200px] w-auto object-contain mb-2 cursor-zoom-in hover:opacity-90 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLightboxSrc(message.image!);
                          }}
                        />
                      )}
                      {message.content && (
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      )}
                    </div>
                    <div className="mt-1 shrink-0 w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                      <User className="size-4 text-primary" />
                    </div>
                  </div>
                ) : (
                  /* ─── Assistant message ─── */
                  <div className="flex gap-3 justify-start">
                    <div className="mt-1 shrink-0 w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                      <Bot className="size-4 text-primary" />
                    </div>
                    <div className="max-w-[85%] flex flex-col">
                      <div className="rounded-2xl rounded-bl-md bg-muted/60 border border-border/40 px-4 py-3">
                        {message.content ? (
                          <MarkdownRenderer
                            content={message.content}
                            isStreaming={isLoading && idx === messages.length - 1}
                            onImageClick={setLightboxSrc}
                          />
                        ) : toolStatus ? (
                          <div className="flex items-center gap-2">
                            {toolStatus.type === "searching" ? (
                              <Globe className="size-4 animate-pulse text-primary" />
                            ) : (
                              <FileTextIcon className="size-4 animate-pulse text-primary" />
                            )}
                            <span className="text-sm text-muted-foreground">
                              {toolStatus.type === "searching" ? t.agentSearching : t.agentReading}:{" "}
                              <span className="italic">
                                {toolStatus.detail.length > 60
                                  ? toolStatus.detail.slice(0, 60) + "…"
                                  : toolStatus.detail}
                              </span>
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Loader2 className="size-4 animate-spin" />
                            <span className="text-sm text-muted-foreground">
                              {t.chatThinking}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Sources collapsible */}
                      {message.sources && message.sources.length > 0 && (
                        <SourcesCollapsible sources={message.sources} />
                      )}

                      {/* Action buttons */}
                      {message.content && (
                        <div className="flex items-center gap-1 mt-1.5 ml-1">
                          <CopyButton text={message.content} />
                          {onRegenerate && idx === messages.length - 1 && !isLoading && (
                            <button
                              onClick={onRegenerate}
                              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-all cursor-pointer"
                              title={t.regenerate}
                            >
                              <RefreshCw className="size-3.5" />
                              <span>{t.regenerate}</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Input */}
      <div className="border-t p-4">
        {/* Image preview */}
        {imagePreview && (
          <div className="mb-2 relative inline-block">
            <img
              src={imagePreview}
              alt=""
              className="h-20 w-auto rounded-lg border object-cover"
            />
            <button
              onClick={() => setImagePreview(null)}
              className="absolute -top-2 -right-2 rounded-full bg-destructive text-destructive-foreground p-0.5 shadow-sm hover:bg-destructive/90 cursor-pointer"
            >
              <X className="size-3" />
            </button>
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageSelect}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="h-12 w-12 rounded-xl border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer disabled:opacity-50 shrink-0"
            title={t.attachImage || "Attach image"}
          >
            <ImagePlus className="size-5" />
          </button>
          <div className="relative flex-1">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder || t.chatPlaceholder}
              className="w-full resize-none rounded-xl border bg-background px-4 py-3 pr-12 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 min-h-[48px] max-h-[120px]"
              rows={1}
              disabled={isLoading}
            />
          </div>
          <Button
            type="submit"
            size="icon"
            disabled={(!input.trim() && !imagePreview) || isLoading}
            className="h-12 w-12 rounded-xl shrink-0"
          >
            {isLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
