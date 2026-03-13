"use client";

import { useState, useCallback, useEffect } from "react";

export interface Conversation {
  id: string;
  title: string;
  mode: string;
  createdAt: number;
  updatedAt: number;
}

function getUserId(): string {
  if (typeof window === "undefined") return "";
  let uid = localStorage.getItem("xivex_uid");
  if (!uid) {
    uid = crypto.randomUUID();
    localStorage.setItem("xivex_uid", uid);
  }
  return uid;
}

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const userId = typeof window !== "undefined" ? getUserId() : "";

  // Load conversations on mount
  const loadConversations = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(`/api/conversations?userId=${userId}`);
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch (err) {
      console.error("Failed to load conversations:", err);
    } finally {
      setIsLoaded(true);
    }
  }, [userId]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Create a new conversation
  const createConversation = useCallback(
    async (mode: string = "chat"): Promise<string> => {
      const id = crypto.randomUUID();
      const title = mode === "chat" ? "New chat" : "New analysis";

      try {
        await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, userId, title, mode }),
        });

        const conv: Conversation = {
          id,
          title,
          mode,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        setConversations((prev) => [conv, ...prev]);
        setActiveId(id);
        return id;
      } catch (err) {
        console.error("Failed to create conversation:", err);
        return id; // Still return id for local usage
      }
    },
    [userId]
  );

  // Update conversation title
  const updateTitle = useCallback(
    async (id: string, title: string) => {
      try {
        await fetch(`/api/conversations/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });

        setConversations((prev) =>
          prev.map((c) => (c.id === id ? { ...c, title } : c))
        );
      } catch (err) {
        console.error("Failed to update title:", err);
      }
    },
    []
  );

  // Delete conversation
  const deleteConversation = useCallback(
    async (id: string) => {
      try {
        await fetch(`/api/conversations/${id}`, { method: "DELETE" });
        setConversations((prev) => prev.filter((c) => c.id !== id));
        if (activeId === id) setActiveId(null);
      } catch (err) {
        console.error("Failed to delete conversation:", err);
      }
    },
    [activeId]
  );

  // Save a message to DB
  const saveMessage = useCallback(
    async (
      conversationId: string,
      message: {
        id: string;
        role: string;
        content: string;
        sources?: { title: string; url: string }[];
      }
    ) => {
      try {
        await fetch(`/api/conversations/${conversationId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(message),
        });
      } catch (err) {
        console.error("Failed to save message:", err);
      }
    },
    []
  );

  // Update a message in DB (for streaming completion)
  const updateMessage = useCallback(
    async (
      conversationId: string,
      messageId: string,
      content: string,
      sources?: { title: string; url: string }[]
    ) => {
      try {
        await fetch(`/api/conversations/${conversationId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: messageId, content, sources, update: true }),
        });
      } catch (err) {
        console.error("Failed to update message:", err);
      }
    },
    []
  );

  // Load messages for a conversation
  const loadMessages = useCallback(
    async (conversationId: string) => {
      try {
        const res = await fetch(
          `/api/conversations/${conversationId}/messages`
        );
        if (res.ok) {
          return await res.json();
        }
        return [];
      } catch (err) {
        console.error("Failed to load messages:", err);
        return [];
      }
    },
    []
  );

  return {
    conversations,
    activeId,
    setActiveId,
    isLoaded,
    createConversation,
    updateTitle,
    deleteConversation,
    saveMessage,
    updateMessage,
    loadMessages,
    refresh: loadConversations,
  };
}
