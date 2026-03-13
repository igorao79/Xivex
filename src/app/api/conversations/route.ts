import { NextRequest, NextResponse } from "next/server";
import {
  listConversations,
  createConversation,
  cleanupOldConversations,
} from "@/lib/db";

// GET /api/conversations?userId=xxx
export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  try {
    // Run cleanup on list requests (lightweight, runs periodically)
    await cleanupOldConversations();

    const conversations = await listConversations(userId);
    return NextResponse.json(conversations);
  } catch (error) {
    console.error("List conversations error:", error);
    return NextResponse.json(
      { error: "Failed to list conversations" },
      { status: 500 }
    );
  }
}

// POST /api/conversations
export async function POST(request: NextRequest) {
  try {
    const { id, userId, title, mode } = await request.json();
    if (!id || !userId) {
      return NextResponse.json(
        { error: "id and userId required" },
        { status: 400 }
      );
    }

    const conv = await createConversation(
      id,
      userId,
      title || "New chat",
      mode || "chat"
    );
    return NextResponse.json(conv);
  } catch (error) {
    console.error("Create conversation error:", error);
    return NextResponse.json(
      { error: "Failed to create conversation" },
      { status: 500 }
    );
  }
}
