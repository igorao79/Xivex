"use client";

import { useState, useCallback, useEffect } from "react";
import { useSession } from "next-auth/react";

export interface Conversation {
  id: string;
  title: string;
  mode: string;
  createdAt: number;
  updatedAt: number;
}

export function useConversations() {
  const { data: session, status } = useSession();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const userId = session?.user?.id || null;

  // Load conversations on mount (only if authenticated)
  const loadConversations = useCallback(async () => {
    if (!userId) {
      setConversations([]);
      setIsLoaded(true);
      return;
    }
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
    if (status !== "loading") {
      loadConversations();
    }
  }, [loadConversations, status]);

  // Create a new conversation
  const createConversation = useCallback(
    async (mode: string = "chat"): Promise<string> => {
      const id = crypto.randomUUID();
      const title = mode === "chat" ? "New chat" : "New analysis";

      if (userId) {
        try {
          await fetch("/api/conversations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, userId, title, mode }),
          });
        } catch (err) {
          console.error("Failed to create conversation:", err);
        }
      }

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
      if (!userId) return; // Don't persist without auth
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
    [userId]
  );

  // Update a message in DB (for streaming completion)
  const updateMessage = useCallback(
    async (
      conversationId: string,
      messageId: string,
      content: string,
      sources?: { title: string; url: string }[]
    ) => {
      if (!userId) return;
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
    [userId]
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
    isAuthenticated: !!userId,
    createConversation,
    updateTitle,
    deleteConversation,
    saveMessage,
    updateMessage,
    loadMessages,
    refresh: loadConversations,
  };
}
