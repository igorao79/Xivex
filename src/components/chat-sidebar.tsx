"use client";

import { Plus, MessageSquare, Trash2, PanelLeftClose, PanelLeft } from "lucide-react";
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

export function ChatSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  isOpen,
  onToggle,
}: ChatSidebarProps) {
  const { t } = useI18n();

  return (
    <>
      {/* Toggle button (always visible) */}
      <button
        onClick={onToggle}
        className="fixed left-3 top-20 z-40 rounded-lg border bg-background/80 backdrop-blur-sm p-2 shadow-sm hover:bg-accent transition-colors"
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
              className="fixed left-0 top-16 bottom-0 z-30 w-[280px] border-r bg-background flex flex-col"
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
                        <div
                          key={conv.id}
                          className={cn(
                            "group flex items-center gap-2 rounded-lg px-3 py-2.5 cursor-pointer transition-colors",
                            activeId === conv.id
                              ? "bg-accent text-accent-foreground"
                              : "hover:bg-accent/50"
                          )}
                          onClick={() => onSelect(conv.id)}
                        >
                          <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm truncate">
                              {conv.title || "New chat"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatDate(conv.updatedAt, t)}
                            </p>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDelete(conv.id);
                            }}
                            className="opacity-0 group-hover:opacity-100 rounded p-1 hover:bg-destructive/10 hover:text-destructive transition-all"
                            title={t.deleteChat}
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
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
