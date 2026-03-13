"use client";

import { useState, useRef, useEffect } from "react";
import { Plus, MessageSquare, Trash2, Pencil, PanelLeftClose, PanelLeft } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useI18n } from "@/lib/i18n";
import type { Conversation } from "@/hooks/use-conversations";
import { cn } from "@/lib/utils";

interface ChatSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

function formatDate(ts: number, t: { today: string; yesterday: string; daysAgo: string }) {
  const now = Date.now();
  const diff = now - ts;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return t.today;
  if (days === 1) return t.yesterday;
  return `${days} ${t.daysAgo}`;
}

function ConversationItem({
  conv,
  isActive,
  onSelect,
  onDelete,
  onRename,
  t,
}: {
  conv: Conversation;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
  t: ReturnType<typeof useI18n>["t"];
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(conv.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== conv.title) {
      onRename(trimmed);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(conv.title);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") handleCancel();
  };

  return (
    <div
      className={cn(
        "group flex items-center gap-2 rounded-lg px-3 py-2.5 cursor-pointer transition-colors",
        isActive
          ? "bg-accent text-accent-foreground"
          : "hover:bg-accent/50"
      )}
      onClick={() => !isEditing && onSelect()}
    >
      <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSave}
            className="w-full bg-background border rounded px-1.5 py-0.5 text-sm outline-none focus:ring-1 focus:ring-primary/50"
            maxLength={50}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <>
            <p className="text-sm truncate">
              {conv.title || "New chat"}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatDate(conv.updatedAt, t)}
            </p>
          </>
        )}
      </div>
      {!isEditing && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setEditValue(conv.title);
              setIsEditing(true);
            }}
            className="rounded p-1 hover:bg-accent transition-colors"
            title={t.renameChat}
          >
            <Pencil className="size-3" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="rounded p-1 hover:bg-destructive/10 hover:text-destructive transition-colors"
            title={t.deleteChat}
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      )}
    </div>
  );
}

export function ChatSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onRename,
  isOpen,
  onToggle,
}: ChatSidebarProps) {
  const { t } = useI18n();

  return (
    <>
      {/* Toggle button (always visible) */}
      <button
        onClick={onToggle}
        className="fixed left-3 top-[4.25rem] sm:top-20 z-40 rounded-lg border bg-background/80 backdrop-blur-sm p-2 shadow-sm hover:bg-accent transition-colors"
        aria-label="Toggle sidebar"
      >
        {isOpen ? (
          <PanelLeftClose className="size-4" />
        ) : (
          <PanelLeft className="size-4" />
        )}
      </button>

      {/* Sidebar */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Mobile overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm sm:hidden"
              onClick={onToggle}
            />

            <motion.aside
              initial={{ x: -280, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -280, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="fixed left-0 top-14 sm:top-16 bottom-0 z-30 w-[280px] border-r bg-background flex flex-col"
            >
              {/* New chat button */}
              <div className="p-3 border-b">
                <Button
                  onClick={onNew}
                  className="w-full justify-start gap-2"
                  variant="outline"
                >
                  <Plus className="size-4" />
                  {t.newChat}
                </Button>
              </div>

              {/* Conversation list */}
              <div className="flex-1 overflow-hidden">
                <div className="px-3 py-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {t.chatHistory}
                  </p>
                </div>

                <ScrollArea className="h-[calc(100vh-180px)]">
                  {conversations.length === 0 ? (
                    <div className="px-3 py-8 text-center">
                      <MessageSquare className="size-8 mx-auto text-muted-foreground/40 mb-2" />
                      <p className="text-sm text-muted-foreground">
                        {t.noHistory}
                      </p>
                    </div>
                  ) : (
                    <div className="px-2 space-y-0.5">
                      {conversations.map((conv) => (
                        <ConversationItem
                          key={conv.id}
                          conv={conv}
                          isActive={activeId === conv.id}
                          onSelect={() => onSelect(conv.id)}
                          onDelete={() => onDelete(conv.id)}
                          onRename={(title) => onRename(conv.id, title)}
                          t={t}
                        />
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
