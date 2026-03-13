import { NextRequest, NextResponse } from "next/server";
import { getMessages, addMessage, updateMessage } from "@/lib/db";

// GET /api/conversations/[id]/messages
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const messages = await getMessages(id);
    return NextResponse.json(messages);
  } catch (error) {
    console.error("Get messages error:", error);
    return NextResponse.json(
      { error: "Failed to get messages" },
      { status: 500 }
    );
  }
}

// POST /api/conversations/[id]/messages — add or update a message
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params;
    const body = await request.json();

    if (body.update) {
      // Update existing message (for streaming completion)
      await updateMessage(body.id, body.content, body.sources);
      return NextResponse.json({ ok: true });
    }

    // Add new message
    await addMessage(conversationId, {
      id: body.id,
      role: body.role,
      content: body.content,
      sources: body.sources,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Add message error:", error);
    return NextResponse.json(
      { error: "Failed to add message" },
      { status: 500 }
    );
  }
}
