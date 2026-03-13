"use client";

import { useState, useCallback, useRef } from "react";
import type { Message, MessageSource } from "./use-chat";

export interface ToolStatus {
  type: "searching" | "reading";
  detail: string;
}

export function useAgentChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [toolStatus, setToolStatus] = useState<ToolStatus | null>(null);
  const lastUserMsgRef = useRef<string>("");

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return;

      lastUserMsgRef.current = content;

      const userMessage: Message = {
        id: `msg-${Date.now()}`,
        role: "user",
        content,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);
      setToolStatus(null);

      const assistantMessage: Message = {
        id: `msg-${Date.now() + 1}`,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      try {
        const chatMessages = [...messages, userMessage].map((m) => ({
          role: m.role,
          content: m.content,
        }));

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
                        ? { ...m, content: fullContent, sources: sources.length > 0 ? sources : undefined }
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

        // Final update with sources
        if (sources.length > 0) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessage.id
                ? { ...m, sources }
                : m
            )
          );
        }
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
    },
    [messages, isLoading]
  );

  const regenerate = useCallback(async () => {
    if (isLoading || messages.length < 2) return;

    // Remove the last assistant message
    const lastAssistantIdx = messages.length - 1;
    if (messages[lastAssistantIdx]?.role !== "assistant") return;

    const prevMessages = messages.slice(0, lastAssistantIdx);
    const lastUserMsg = prevMessages.findLast((m) => m.role === "user");
    if (!lastUserMsg) return;

    setMessages(prevMessages.slice(0, -1)); // Remove last user msg too, sendMessage will re-add it

    // Small delay to let state settle
    await new Promise((r) => setTimeout(r, 50));

    // Trigger a fresh send with the same content
    // We need to directly call the API without going through sendMessage's state dependency
    const content = lastUserMsg.content;

    setIsLoading(true);
    setToolStatus(null);

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: "user",
      content,
      timestamp: Date.now(),
    };

    const assistantMessage: Message = {
      id: `msg-${Date.now() + 1}`,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    };

    const newMessages = [...prevMessages.slice(0, -1), userMessage];
    setMessages([...newMessages, assistantMessage]);

    try {
      const chatMessages = newMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

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
                setToolStatus({ type: parsed.tool_status, detail: parsed.query || parsed.url || "" });
              } else if (parsed.sources) {
                sources = parsed.sources;
              } else if (parsed.content) {
                setToolStatus(null);
                fullContent += parsed.content;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessage.id
                      ? { ...m, content: fullContent, sources: sources.length > 0 ? sources : undefined }
                      : m
                  )
                );
              }
            } catch {}
          }
        }
      }

      if (sources.length > 0) {
        setMessages((prev) =>
          prev.map((m) => m.id === assistantMessage.id ? { ...m, sources } : m)
        );
      }
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
  }, [messages, isLoading]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setToolStatus(null);
  }, []);

  return { messages, isLoading, toolStatus, sendMessage, regenerate, clearMessages };
}
