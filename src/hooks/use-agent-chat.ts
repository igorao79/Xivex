"use client";

import { useState, useCallback } from "react";
import type { Message, MessageSource } from "./use-chat";

export interface ToolStatus {
  type: "searching" | "reading";
  detail: string;
}

interface PersistCallbacks {
  onUserMessage?: (msg: Message) => void;
  onAssistantDone?: (msg: Message) => void;
}

export function useAgentChat(persist?: PersistCallbacks) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [toolStatus, setToolStatus] = useState<ToolStatus | null>(null);

  /** Load messages from DB into state */
  const setMessagesFromDB = useCallback((msgs: Message[]) => {
    setMessages(msgs);
  }, []);

  /** Shared streaming logic */
  const streamResponse = useCallback(
    async (
      chatMessages: { role: string; content: string | any[] }[],
      assistantMessage: Message
    ): Promise<Message> => {
      const response = await fetch("/api/agent-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: chatMessages }),
      });

      if (!response.ok) throw new Error("Agent chat request failed");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No response stream");

      let fullContent = "";
      let sources: MessageSource[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") break;

            try {
              const parsed = JSON.parse(data);

              if (parsed.tool_status) {
                setToolStatus({
                  type: parsed.tool_status,
                  detail: parsed.query || parsed.url || "",
                });
              } else if (parsed.sources) {
                sources = parsed.sources;
              } else if (parsed.content) {
                setToolStatus(null);
                fullContent += parsed.content;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessage.id
                      ? {
                          ...m,
                          content: fullContent,
                          sources:
                            sources.length > 0 ? sources : undefined,
                        }
                      : m
                  )
                );
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }

      const finalMsg: Message = {
        ...assistantMessage,
        content: fullContent,
        sources: sources.length > 0 ? sources : undefined,
      };

      setMessages((prev) =>
        prev.map((m) => (m.id === assistantMessage.id ? finalMsg : m))
      );

      return finalMsg;
    },
    []
  );

  const sendMessage = useCallback(
    async (content: string, image?: string) => {
      if ((!content.trim() && !image) || isLoading) return;

      const userMessage: Message = {
        id: `msg-${Date.now()}`,
        role: "user",
        content,
        timestamp: Date.now(),
        image,
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);
      setToolStatus(null);

      persist?.onUserMessage?.(userMessage);

      const assistantMessage: Message = {
        id: `msg-${Date.now() + 1}`,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      try {
        // Build messages for API — convert images to multimodal content
        const chatMessages = [...messages, userMessage].map((m) => {
          if (m.image) {
            return {
              role: m.role,
              content: [
                ...(m.content ? [{ type: "text", text: m.content }] : []),
                { type: "image_url", image_url: { url: m.image } },
              ],
            };
          }
          return { role: m.role, content: m.content };
        });

        const finalMsg = await streamResponse(chatMessages, assistantMessage);
        persist?.onAssistantDone?.(finalMsg);
      } catch (error) {
        console.error("Agent chat error:", error);
        const errorMsg: Message = {
          ...assistantMessage,
          content: "Sorry, something went wrong. Please try again.",
        };
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMessage.id ? errorMsg : m))
        );
        persist?.onAssistantDone?.(errorMsg);
      } finally {
        setIsLoading(false);
        setToolStatus(null);
      }
    },
    [messages, isLoading, persist, streamResponse]
  );

  const regenerate = useCallback(async () => {
    if (isLoading || messages.length < 2) return;

    const lastIdx = messages.length - 1;
    if (messages[lastIdx]?.role !== "assistant") return;

    const withoutLast = messages.slice(0, lastIdx);
    setMessages(withoutLast);

    setIsLoading(true);
    setToolStatus(null);

    const assistantMessage: Message = {
      id: `msg-${Date.now()}`,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, assistantMessage]);

    try {
      const chatMessages = withoutLast.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const finalMsg = await streamResponse(chatMessages, assistantMessage);
      persist?.onAssistantDone?.(finalMsg);
    } catch (error) {
      console.error("Agent chat error:", error);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessage.id
            ? { ...m, content: "Sorry, something went wrong. Please try again." }
            : m
        )
      );
    } finally {
      setIsLoading(false);
      setToolStatus(null);
    }
  }, [messages, isLoading, persist, streamResponse]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setToolStatus(null);
  }, []);

  return {
    messages,
    isLoading,
    toolStatus,
    sendMessage,
    regenerate,
    clearMessages,
    setMessagesFromDB,
  };
}
