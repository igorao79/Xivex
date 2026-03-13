import { createClient } from "@libsql/client";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

// ── Schema init (idempotent) ──────────────────────────────────────────────
let initialized = false;

export async function initDB() {
  if (initialized) return;

  await db.batch([
    {
      sql: `CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        mode TEXT NOT NULL DEFAULT 'chat',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      args: [],
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        sources TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      )`,
      args: [],
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_conv_user ON conversations(user_id)`,
      args: [],
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_conv_updated ON conversations(updated_at)`,
      args: [],
    },
    {
      sql: `CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id)`,
      args: [],
    },
  ]);

  initialized = true;
}

// ── 30-day cleanup ────────────────────────────────────────────────────────
export async function cleanupOldConversations() {
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

  // Delete messages belonging to old conversations first, then conversations
  await db.batch([
    {
      sql: `DELETE FROM messages WHERE conversation_id IN (
        SELECT id FROM conversations WHERE updated_at < ?
      )`,
      args: [thirtyDaysAgo],
    },
    {
      sql: `DELETE FROM conversations WHERE updated_at < ?`,
      args: [thirtyDaysAgo],
    },
  ]);
}

// ── Conversations CRUD ────────────────────────────────────────────────────

export async function listConversations(userId: string) {
  await initDB();

  const result = await db.execute({
    sql: `SELECT id, title, mode, created_at, updated_at FROM conversations
          WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50`,
    args: [userId],
  });

  return result.rows.map((r) => ({
    id: r.id as string,
    title: r.title as string,
    mode: r.mode as string,
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
  }));
}

export async function createConversation(
  id: string,
  userId: string,
  title: string,
  mode: string
) {
  await initDB();
  const now = Date.now();

  await db.execute({
    sql: `INSERT INTO conversations (id, user_id, title, mode, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [id, userId, title, mode, now, now],
  });

  return { id, title, mode, createdAt: now, updatedAt: now };
}

export async function updateConversationTitle(id: string, title: string) {
  await db.execute({
    sql: `UPDATE conversations SET title = ? WHERE id = ?`,
    args: [title, id],
  });
}

export async function touchConversation(id: string) {
  await db.execute({
    sql: `UPDATE conversations SET updated_at = ? WHERE id = ?`,
    args: [Date.now(), id],
  });
}

export async function deleteConversation(id: string) {
  await db.batch([
    { sql: `DELETE FROM messages WHERE conversation_id = ?`, args: [id] },
    { sql: `DELETE FROM conversations WHERE id = ?`, args: [id] },
  ]);
}

// ── Messages CRUD ─────────────────────────────────────────────────────────

export async function getMessages(conversationId: string) {
  await initDB();

  const result = await db.execute({
    sql: `SELECT id, role, content, sources, created_at FROM messages
          WHERE conversation_id = ? ORDER BY created_at ASC`,
    args: [conversationId],
  });

  return result.rows.map((r) => ({
    id: r.id as string,
    role: r.role as "user" | "assistant",
    content: r.content as string,
    sources: r.sources ? JSON.parse(r.sources as string) : undefined,
    timestamp: r.created_at as number,
  }));
}

export async function addMessage(
  conversationId: string,
  message: {
    id: string;
    role: string;
    content: string;
    sources?: { title: string; url: string }[];
  }
) {
  await initDB();
  const now = Date.now();

  await db.batch([
    {
      sql: `INSERT INTO messages (id, conversation_id, role, content, sources, created_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        message.id,
        conversationId,
        message.role,
        message.content,
        message.sources ? JSON.stringify(message.sources) : null,
        now,
      ],
    },
    {
      sql: `UPDATE conversations SET updated_at = ? WHERE id = ?`,
      args: [now, conversationId],
    },
  ]);
}

export async function updateMessage(
  messageId: string,
  content: string,
  sources?: { title: string; url: string }[]
) {
  await db.execute({
    sql: `UPDATE messages SET content = ?, sources = ? WHERE id = ?`,
    args: [content, sources ? JSON.stringify(sources) : null, messageId],
  });
}

export default db;
